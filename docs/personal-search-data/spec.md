# Спецификация: единый источник личных поисковых данных (personal mode + Profile)

**Статус:** черновик v1 · 2026-07-04
**Ветка:** `feat/personal-search-data`

---

## 0. Что меняется и почему

1. **`/explore?mode=personal` агрегирует не найденные статьи, а параметры фильтров** (`historyStore.selectByYear/DocType/Country/Journal` читают `search_history.filters`, не `articles`). `TopJournalsChart` в personal mode структурно всегда пуст — `GET /articles/find` не принимает фильтр по журналу. Заменяем на реальный агрегат по статьям через `get_search_stats_for_user` (уже существует в `postgres_search_result_repo.py`, используется `/articles/search/stats` для HomePage, но никогда не вызывался с `search=None` — путь не покрыт тестами).
2. **`search_history` растёт бесконечно** — retention/pruning отсутствует полностью (проверено `rg` по проекту). На бесплатном тарифе Supabase (лимит 500 МБ, сейчас занято 95 МБ) это риск. Параметр `n<=100` в `GET /articles/history` — только предел выдачи API, не хранения. **Решение: ввести физический predел 100 записей на пользователя** — реализуется в этом тикете (см. §1).
3. **`GET /articles/history/{search_id}/results`** уже отдаёт полный `ArticleResponse` (все 9 доступных Scopus-полей) по конкретному прошлому поиску, но не используется нигде на фронтенде. Даём пользователю просмотр найденных статей прямо в `/profile` (§3) — переиспользуя существующий эндпоинт и `ArticleCard` (не `ArticleList` целиком — см. §3).
4. **Единый источник** = один и тот же join `search_history ⋈ search_result_articles ⋈ articles` и одно и то же окно («последние 100 поисков») под списком (`/profile`) и агрегатами (`/explore personal`) — не один HTTP-эндпоинт на два структурно разных UI (список ≠ агрегат по форме ответа).

---

## 1. Retention: бесшовный лимит 100 поисков на пользователя

### 1.1 Механизм (real-time, без отдельной джобы/крона)

Триммингнг происходит **внутри существующей транзакции** `SearchService.find_and_save()`, внутри уже существующего per-user `pg_advisory_lock` (роутер `/find` уже сериализует запросы одного `user_id` — гонок не возникает бесплатно, новой блокировки не требуется):

```
insert_row(history)  →  trim_to_last_n(user_id, n=100)  →  save_results(new_history_id, articles)  →  commit()
```

- Новая строка истории **всегда переживает** trim (она самая свежая по `created_at`) — блока/ошибки для пользователя нет, 101-я (самая старая) тихо удаляется.
- `search_result_articles.search_history_id` уже `ondelete="CASCADE"` — удаление старой строки истории автоматически подчищает её результаты. Строки `articles` не трогаем (общий, дедуплицированный ресурс — может использоваться каталогом/другими пользователями); сборка мусора по «осиротевшим» статьям — вне скоупа (см. §7).

### 1.2 Реализация

- `ISearchHistoryRepository.trim_to_last_n(user_id: int, n: int) -> int` (возвращает число удалённых строк)
- `PostgresSearchHistoryRepository`:
  ```sql
  DELETE FROM search_history
  WHERE user_id = :user_id
    AND id NOT IN (
      SELECT id FROM search_history
      WHERE user_id = :user_id
      ORDER BY created_at DESC, id DESC
      LIMIT :n
    )
  ```
  Портируемо на SQLite (без PG-специфики — dialect-проверка не нужна).
- Вызов — новый шаг в `SearchService.find_and_save()`, `n=100` — константа, общая с `GET /articles/history` (вынести в один модуль, не дублировать литерал).

### 1.3 Разовая миграция для уже существующих данных

Alembic data migration (не схемная) — на случай, если у какого-то пользователя уже >100 строк (на проде сейчас максимум 94 — не сработает, но требование явное):
```sql
DELETE FROM search_history WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at DESC, id DESC) rn
    FROM search_history
  ) t WHERE rn > 100
);
```

---

## 2. Реальная агрегация вместо фильтров

### 2.1 `get_search_stats_for_user` — добавить `by_open_access`

Единственное осмысленное **новое категориальное измерение** (bool → 2 бакета), закрывает пробел паритета с collection mode (там OA уже есть в KPI/drawer). Реализация — ещё один `GROUP BY open_access` по уже существующему join, `.distinct(Article.id)` не трогаем (дедуп статей между поисками пользователя — подтверждённая осознанная семантика).

`author`/`title`/`doi` как измерения агрегации — **не добавляем**: `author` — это только первый автор (`dc:creator`), агрегат по нему вводит в заблуждение так же, как уже удалённый из collection mode `TopAuthorsChart`; `title`/`doi` дали бы по сути список из ≤2500 уникальных строк под видом «графика», не агрегат. Эти атрибуты уже полностью доступны по-статейно через §3.

### 2.2 Новый эндпоинт (не расширение `/search/stats`)

```
GET /articles/stats/personal   (JWT обязателен, без кэша)
```
— вызывает `get_search_stats_for_user(user_id, search=None)`. Отдельный роут, а не `search=None` через существующий `/articles/search/stats` — путь `search=None` в проде никогда не выполнялся и не тестировался (роутер требует `min_length=2`); чище и безопаснее не трогать работающий HomePage-флоу. Кэш не нужен (низкий QPS, join на ≤100 записей, per-user — по аналогии с некэшируемыми `/stats/pivot`/`/stats/journal-impact`).

---

## 3. Полнодетальный просмотр статей в `/profile`

**Риски и целесообразность обсуждены отдельно (диалог 2026-07-04) — решение: оставить в этом тикете, с обязательным фиксом ниже.** DB-нейтрально (данные и так уже хранятся, эндпоинт уже существует), не портфолио-приоритет по фидбэк-доку (см. `docs/project_context/`) — но дёшево при соблюдении двух ограничений:

- **Переиспользовать только `ArticleCard`, не `ArticleList`.** `ArticleList` тянет `ArticleFiltersSidebar`/`ArticleFiltersMobile`/`PaginationBar` — инфраструктуру живого поиска по каталогу, лишнюю и семантически неверную для статичного просмотра ≤25 статей одного прошлого поиска. Нужен только маппинг `articles.map(a => <ArticleCard article={a} />)` внутри новой лёгкой обёртки (без фильтров, без re-fetch пагинации — самих статей ≤25, клиентская пагинация не нужна).
- **Строго lazy: и код, и данные.** (1) Компонент-обёртка раскрытой детали — через `lazy()`/`Suspense`, тем же паттерном, что чарты в `ExplorePage.tsx` — не должен попасть в основной чанк `ProfilePage`. (2) `getSearchResults(searchId)` вызывается **только по клику на expand** конкретной строки, никогда на монтировании страницы/списка и без prefetch остальных строк — иначе до 100 лишних запросов за один визит на `/profile`.
- **A11y — не по остаточному принципу.** Раз это новая интерактивная поверхность в проекте без автоматической a11y-проверки (lighthouse-CI/axe — по фидбэку, известный пробел) — обязательны `aria-expanded` на строке-триггере, `aria-controls` на раскрываемый блок, управление фокусом при expand/collapse (тот же уровень внимания, что уже есть у `DimensionDrawer`/`PivotTable`), закладываем руками, не «потом добавим».
- `SearchHistoryList.tsx` — по клику на строку (expand/collapse) лениво дёргает **уже существующий** `GET /articles/history/{search_id}/results` (ownership-проверка уже встроена).
- Новая функция `api/articles.ts`: `getSearchResults(searchId: number): Promise<SearchResultsResponse>` — тип `SearchResultsResponse` уже объявлен в `types/api.ts`, не использовался.

---

## 4. Минимальная переработка `/explore?mode=personal`

- `ExplorePage.tsx`: заменить `useMemo` + `selectByYear/DocType/Country/Journal` на fetch `GET /articles/stats/personal` (форма ответа уже совпадает с `LabelCount[]`, 4 существующих чарта не меняются).
- `historyStore.ts`: удалить 4 мёртвых селектора и приватные хелперы (`extractValues`/`incr`/`toLabelCount`/`MISSING`).

---

## 5. Тестовое покрытие (production-grade, цель +2-3% к текущим ~80% backend)

**Backend — новое (сейчас 0% на этих путях):**
- `get_search_stats_for_user`: `search=None` (полная личная история), дедуп статьи из 2 разных поисков одного юзера, `by_open_access`, пустая история, **чужие статьи не протекают** (security), `since`-фильтр.
- `GET /articles/stats/personal`: 401 без JWT, форма ответа, пустая история → нули.
- `trim_to_last_n`: удаляет именно самые старые сверх `n`, не трогает других пользователей, cascade на `search_result_articles`, идемпотентность при ≤100 строк.
- `SearchService.find_and_save`: 101-й поиск не падает и не блокируется, старейшая запись исчезает атомарно с новой транзакцией.
- `GET /articles/history/{search_id}/results` (уже существует, 0 тестов сейчас) — router-level: ownership (чужой `search_id` → 404/403), схема ответа, пустой результат.
- Data-migration: применяется идемпотентно (повторный запуск — no-op).

**Frontend (co-location):**
- `ExplorePage.test.tsx` — personal-mode: мок нового API вместо `historyStore`-селекторов.
- `SearchHistoryList.test.tsx` (новый файл — сейчас 0 тестов) — expand/collapse, лениво вызывает `getSearchResults` (только по клику, не на монтировании), рендерит `ArticleCard`-обёртку, `aria-expanded`/`aria-controls` меняются корректно.

---

## 6. Чек-лист реализации

- [x] `ISearchHistoryRepository.trim_to_last_n` + Postgres-реализация
- [x] `SearchService.find_and_save` — вызов trim внутри транзакции
- [x] Alembic data migration — разовый бэкфилл лимита 100
- [x] `SearchStatsResponse` + `get_search_stats_for_user` — `by_open_access`
- [x] `GET /articles/stats/personal` — новый роут
- [x] `api/articles.ts` — `getPersonalStats()`, `getSearchResults()`
- [x] `ExplorePage.tsx` / `historyStore.ts` — переключение источника, удаление мёртвого кода
- [x] `SearchHistoryList.tsx` — expand-детали: lazy-обёртка на `ArticleCard`, fetch строго по клику, `aria-expanded`/`aria-controls`
- [x] Тесты backend (§5) — combined coverage 81% (порог CI 80% пройден; целевой прирост +2-3% явно не подтверждён, см. §8)
- [x] Тесты frontend (§5)

---

## 7. Вне скоупа v1 (зафиксировано, не блокирует старт)

- Сборка мусора по `articles`, не referenced ни одной `search_result_articles` — отдельная задача (нужно решить статус относительно каталога-сидера).
- `cited_by_count` как скалярный агрегат (`total_citations`/`avg_citations`) — самостоятельная фича, не измерение `by_X`.
- Кэширование `/articles/stats/personal`.
- Изменение глубины 100 → другое число — решено оставить 100 (не влияет на хранение, чисто UX-параметр).

---

## 8. Статус выполнения

**Смёрджено:** 2026-07-04, PR [#45](https://github.com/HelgDemidov/scopus_search_code/pull/45) → `main` (merge commit `9d77015`).
**Коммиты ветки `feat/personal-search-data`:** `b991f45` (реализация §1–§4), `0098a42` (ruff format fix), `a210573` (docs: ruff format --check в CLAUDE.md).

**Сделано — всё по чек-листу §6**, включая оба бага, найденных по ходу реализации (не было в исходной спеке):
1. `keep_since`-предохранитель в `trim_to_last_n` — без него retention ломал бы недельную квоту Scopus (`HISTORY_DEPTH_LIMIT=100 < QUOTA_LIMIT=200` за то же 7-дневное окно).
2. Ветка пустого состояния `explore.emptyPersonal` была технически недостижима в старом коде (`personalData` всегда truthy) — исправлено проверкой `personalStats.total > 0`.

Заодно: первое тестовое покрытие `get_search_stats_for_user` (0→15 тестов), фикс deprecation warning (`DISTINCT ON` недоступен на SQLite), фикс CI (`ruff format --check` отсутствовал в документированной команде — попал в отдельный коммит после первого красного прогона).

**Метрики:** backend 209 тестов, combined coverage (test+test-pg) **81%** — порог CI (80%) пройден с запасом, но целевой прирост +2-3%, о котором просил пользователь, **не подтверждён явно** (решено не гнаться за точной цифрой — см. диалог 2026-07-04, пользователь согласился, что порога достаточно). Frontend 527→543 тестов, `ruff`/`mypy`/ESLint/`tsc`/build — все чистые.

**Вне скоупа v1** — см. §7, актуально без изменений.

**Post-prod доработка (2026-07-05):** клик по карточке статьи в `/profile` (§3) вскрыл цепочку из 3 независимых багов подряд — каждый чинился отдельным коммитом на `main`, каждый следующий обнаруживался только после фикса предыдущего:
1. **Роутинг** — `ArticleCard.tsx` линковал на `/articles/:id` (мн. число), `App.tsx` регистрировал `/article/:id` (ед. число); разъезд возник в несвязанном рефакторинге ещё 2026-04-28, дожил до этой фичи незамеченным (ни один тест не проверял, что Link резолвится в реальный маршрут). Фикс: ссылка приведена к ед. числу + `router.tsx` вынесен из `App.tsx` с экспортом `appRoutes`, чтобы `ArticleCard.test.tsx` мог проверять `matchRoutes(appRoutes, href)` — теперь такой разъезд ловится тестом.
2. **Тихая деградация auth** — `get_optional_current_user` на невалидный/истёкший токен молча возвращал `None` вместо 401 (в отличие от `get_current_user`), поэтому фронтендовый silent-refresh для `GET /articles/{id}` никогда не срабатывал. Фикс: невалидный токен теперь тоже даёт 401 (токен отсутствует — по-прежнему legit anonymous). Реальной причиной конкретно этого прод-инцидента не оказался, но самостоятельный баг, достойный фикса.
3. **Сломанный SQL-join (настоящая причина 500)** — `postgres_article_repo.get_by_id`: `select(sa.literal(1)).join(SearchHistory, ...)` не даёт SQLAlchemy определить левую сторону join → `InvalidRequestError` на любом реальном движке для ЛЮБОЙ не-каталожной статьи, просматриваемой залогиненным пользователем. 100% воспроизводимо, не зависело от конкретной статьи; не было поймано ни одним тестом, потому что `user_id != None` никогда не гонялся через реальный SQL (только моканный `ArticleService.get_by_id`). Подтверждено напрямую против прод-БД (тот же код репозитория, локальный `.env` → прод). Фикс: явный `.select_from(SearchResultArticle)`.

Два новых интеграционных теста в `test_article_by_id.py` воспроизводят баг 3 на SQLite (проверено: без фикса падают тем же `InvalidRequestError`, что и прод). Урок: видимость через `user_id`-ветку в `get_by_id` не имела ни одного теста на реальном движке с момента появления в этом же PR — мокнутый unit-тест на сервисе создал ложное ощущение покрытия.

