# Спецификация: unification KPI+Drawer в personal mode + автобиографический раздел `/explore?mode=personal`

**Статус:** черновик v1 · 2026-07-05
**Ветка:** `feat/explore-personal-redesign`

---

## 0. Что меняется и почему

### 0.1 Работа 1 — унификация KPI + Drawer

4 старых чарта personal mode (`PublicationsByYearChart`/`DocumentTypesChart`/`TopCountriesChart`/`TopJournalsChart`) заменяются на визуальный язык collection mode: KPI-тайлы (`KpiTile`) + click-to-detail `Sheet`-drawer (тот же паттерн, что `KpiRow`/`DimensionDrawer` в collection). Обоснование: данные `SearchStatsResponse` (`/stats/personal`) уже используют идентичный тип `LabelCount[]` (`{label, count}`) для `by_year`/`by_journal`/`by_country`/`by_doc_type`/`by_open_access` — тот же формат, что и в `StatsResponse` collection mode. Переиспользование визуальных примитивов здесь дёшево и не требует новых бэкенд-агрегатов (см. §1.2).

### 0.2 Работа 2 — автобиографический раздел

Ни один существующий график (ни старый personal-набор, ни новый collection-набор) не отвечает на вопрос «что происходило с МОЕЙ поисковой активностью во времени» — у collection mode вообще нет понятия времени поиска (там время = год публикации статьи, не время самого поиска). Это подтверждённый пробел, а не дублирование уже показанного. Выбраны (см. диалог, вопросы пользователю):

1. **Поисковая активность по времени** — комбо: stacked-бары (успешные / нулевые поиски за период) + линия накопления уникальных статей. Авто-грануляция week/month.
2. **Filter fingerprint heatstrip** — таймлайн-полоса, одна строка на измерение фильтра (open_access / кол-во doc_types / кол-во стран / ширина year-range), столбец — один поиск в хронологическом порядке.

Оба разреза используют данные, которых нет ни в одном текущем графике `/explore` (ни collection, ни personal) — не изобретение поверх уже показанного, а закрытие реального пробела.

---

## 1. Работа 1 — KPI + Drawer для personal mode

### 1.1 Состав тайлов (5, не 6)

`author` — исключается. `SearchStatsResponse` не содержит `by_author`/`top_authors` (в отличие от `StatsResponse`); добавлять новый агрегат ради одного тайла не оправдано — personal-режим и так закрывает автобиографический пробел через работу 2. Пять тайлов:

| Dimension | Значение (personal) | Источник (уже есть, 0 новых полей) |
|---|---|---|
| `year` | всего найденных статей | `total` |
| `country` | кол-во уникальных стран | `by_country.length` |
| `open_access` | кол-во OA-статей | `by_open_access.find(x => x.label === 'true')?.count ?? 0` |
| `doc_type` | кол-во типов документов | `by_doc_type.length` |
| `journal` | кол-во уникальных журналов | `by_journal.length` |

Паттерн `by_doc_type.length` для тайла уже используется в текущем `KpiRow.tsx:38` (`getValue: (s) => s.by_doc_type.length`) — переносим тот же приём на personal-схему, backend не трогаем вообще для этой части.

### 1.2 Архитектура — без изменений в collection mode

`KpiRow`/`DimensionDrawer` сейчас **сами** читают `useStatsStore` (жёсткая связь с collection-эндпоинтом) — прямое переиспользование невозможно без рефакторинга на props. План:

1. Ввести общий TS-интерфейс `DimensionStatsSource` (`by_year`/`by_journal`/`by_country`/`by_doc_type`/`by_open_access`, все `LabelCount[]`) в `types/api.ts`. И `StatsResponse`, и `SearchStatsResponse` уже структурно ему удовлетворяют — изменений в бэкенд-схемах не требуется.
2. `getConfig()` в `DimensionDrawer.tsx` — сузить тип параметра `stats: StatsResponse | null` → `stats: DimensionStatsSource | null`; функция и так обращается только к полям, входящим в общий интерфейс (кроме `author`-ветки, которая остаётся недоступной, если `dimension` не входит в переданный список допустимых для конкретного источника).
3. `KpiRow`/`DimensionDrawer` — перевести на приём `source`/`isLoading` через props вместо прямого чтения `useStatsStore` внутри. Для сохранения нулевого риска регрессии в collection mode: оставить `<KpiRow />`/`<DimensionDrawer />` как есть внешне (обёртки без пропсов, читающие `useStatsStore` и прокидывающие вниз в общий презентационный компонент) — то есть сам рефакторинг invisible снаружи для существующих call site в `ExplorePage.tsx`.
4. Новые тонкие обёртки `PersonalKpiRow`/`PersonalDimensionDrawer` — читают personal-стор (см. §1.3), передают тот же общий презентационный слой, но со списком из 5 dimension (без `author`).
5. `dashboardStore`: `drawerDimension`/`openDrawer`/`closeDrawer` — общий стор используется и коллекцией, и personal-обёрткой (single Sheet instance на весь `ExplorePage`, т.к. режимы взаимоисключающие — переключение между `mode=collection`/`mode=personal` уже закрывает предыдущий вид). Проверить: при смене `mode` drawer должен закрываться (`closeDrawer()` в `useEffect` на смену `mode`), иначе возможен edge-case открытого drawer с "залипшим" измерением после переключения.

### 1.3 Данные

Новый лёгкий стор `personalStatsStore.ts` (или расширение существующего state в `ExplorePage.tsx` — на усмотрение реализации, не строгое требование) — оборачивает уже существующий `getPersonalStats()` (`/stats/personal`), без изменений бэкенда.

### 1.4 Что удаляется

`PublicationsByYearChart`/`DocumentTypesChart`/`TopCountriesChart`/`TopJournalsChart` — удалить вместе с `.test.tsx`, если после этой работы больше нигде не используются (проверить `components/charts/` на прочих потребителей перед удалением — по текущему коду единственный потребитель обоих — `ExplorePage.tsx` personal-ветка).

### 1.5 Тесты

- `KpiRow`/`DimensionDrawer` — существующие тесты не должны измениться по поведению (рефакторинг на props — чисто внутренний; тесты обёрток `<KpiRow />`/`<DimensionDrawer />` продолжают работать без правок).
- `PersonalKpiRow`/`PersonalDimensionDrawer` — новые тесты: 5 тайлов (без author), значения из `SearchStatsResponse`-фикстуры, клик открывает drawer с тем же измерением.
- Regression-тест на переключение mode: drawer закрывается при смене `mode=collection` ↔ `mode=personal`.

---

## 2. Работа 2 — автобиографический раздел

### 2.1 Поисковая активность по времени

**Метрика.** Один комбо-график: stacked-бар (успешные поиски / поиски с 0 результатов) за период + линия накопления **уникальных** статей (не суммарного `result_count` — иначе повторные похожие поиски задвоят рост; статья считается «найденной» в момент первого появления в `search_result_articles` пользователя).

**Авто-грануляция.** week, если разброс `created_at` (`max - min`) по истории пользователя ≤ 70 дней, иначе month. Причина: `HISTORY_DEPTH_LIMIT=100` — активный пользователь заполняет лимит за недели, редкий — за месяцы/годы; фиксированная грануляка была бы либо пустой (мало недель), либо нечитаемой (сотни точек по дням).

**Backend.** Новый эндпоинт, без кэша (аналогия с `/stats/journal-impact`/`/stats/pivot` — низкий QPS, персональный расчёт):

```
GET /articles/stats/personal/activity
```

Схемы (`app/schemas/article_schemas.py`):

```python
class PersonalActivityBucket(BaseModel):
    period_start: date
    successful_searches: int   # result_count > 0
    zero_result_searches: int  # result_count == 0
    cumulative_unique_articles: int  # нарастающим итогом на конец периода

class PersonalActivityResponse(BaseModel):
    granularity: Literal["week", "month"]
    buckets: list[PersonalActivityBucket]
```

Репозиторий (`ISearchResultRepository`/`PostgresSearchResultRepository`, новый метод `get_personal_activity_for_user(user_id)`, по аналогии с уже существующим `get_search_stats_for_user`):

- Бары: `GROUP BY period, (result_count > 0)` по `search_history WHERE user_id` — без join, дёшево.
- Линия: `SELECT article_id, MIN(sh.created_at) FROM search_result_articles sra JOIN search_history sh ON sra.search_history_id = sh.id WHERE sh.user_id = :user_id GROUP BY article_id` → группировка первого появления по периоду → cumulative sum **в Python** (тот же приём, что медиана в `get_journal_impact` — портируемо между PG/SQLite, не полагаемся на PG-specific window functions).
- **Важно (урок этой сессии, см. память `project-broken-join-visibility-bug`):** этот join — тот же паттерн `search_result_articles ⋈ search_history WHERE user_id`, что и сломанный `get_by_id`. Обязательно: (а) писать через ORM-класс, не `select(sa.literal(1))`, (б) минимум один интеграционный тест на реальном движке (SQLite), не только мокнутый unit-тест сервиса.

**Ограничение (принимается, не блокирует).** Retention (`trim_to_last_n`, PR #45) каскадно удаляет `search_result_articles` вместе со старыми `search_history` (`ondelete="CASCADE"`) — график по конструкции показывает активность только в пределах сохранённого окна (последние ≤100 записей истории), не всю жизнь аккаунта. Совпадает с уже принятым в PR #45 компромиссом ретеншна, отдельно не переосмысливаем.

**Frontend.** `PersonalActivityChart.tsx` (Recharts `ComposedChart`: `Bar` stacked (successful/zero) + `Line` (cumulative)), full-width, лениво импортируется. Цвет zero-result сегмента — отдельный, приглушённый (не error-red — это не ошибка приложения, а поведение пользователя; тон "amber/muted", согласованный с `chartColors.ts`, не новая произвольная палитра). Тултип — период, успешных/нулевых поисков, накопленный итог.

### 2.2 Filter fingerprint heatstrip

**Данные — без нового backend-эндпоинта.** Уже существующий `GET /articles/history?n=` (используется в `/profile`) отдаёт `SearchHistoryItemResponse.filters: dict` + `created_at` + `results_available` — ровно то, что нужно. Расширить `getSearchHistory(n?: number)` в `api/articles.ts` опциональным параметром `n` (эндпоинт уже поддерживает `n` через `Query`, фронт пока его не прокидывал).

**N и порядок.** Последние 15 поисков на десктопе / 8 на мобильном (`useMediaQuery`, существующий хук). API отдаёт по убыванию времени (см. `/profile`) — на фронте развернуть в хронологический порядок (старые слева → новые справа, как в выбранном превью).

**Строки (метрики per-search, все вычисляются на фронте из `filters` dict, 0 новых backend-полей):**

| Строка | Вычисление из `filters` |
|---|---|
| open_access filter | `filters.open_access !== undefined` (bool-присутствие) |
| doc_types (n выбрано) | `filters.document_types?.length ?? 0` |
| countries (n выбрано) | `filters.countries?.length ?? 0` |
| year range width | `filters.year_to - filters.year_from` (оба заданы) → число; иначе — "—" (не сужал) |

**Цветовое кодирование.** Row-relative нормализация (мин/макс **внутри своей строки**, не глобально по всей таблице) — иначе строка "year range width" (шкала лет) визуально "забьёт" строку "doc_types" (шкала 0-5), которые технически на разных порядках величин. Каждая строка — свой цветовой градиент от `AXIS_COLORS`-совместимой палитры.

**Responsive.** Горизонтальный scroll-контейнер (`overflow-x-auto`) на десктопе при N=15; на мобильном — N=8 без скролла (см. выше). Zero-result поиски (из §2.1) — тонкая маркировка снизу столбца (напр. точка/иконка под колонкой) — связывает оба разреза автобиографического раздела единым визуальным сигналом «эта попытка поиска ничего не дала».

**Frontend.** `FilterFingerprintStrip.tsx`, компактная grid/table-разметка (не Recharts — это не chart-библиотечная форма, а кастомная heatmap-таблица, как `PivotTable.tsx` не на Recharts).

### 2.3 Тесты

- Backend: `get_personal_activity_for_user` — граничные периоды (авто week/month переключение по порогу 70 дней), zero-result корректно учитываются в `zero_result_searches`, cumulative считается по first-seen article_id (не задваивается при повторном нахождении той же статьи), пустая история не падает. Unit (мокнутый repo) + integration (реальная SQLite сессия, фикстуры с пересекающимися результатами двух поисков).
- Frontend: `PersonalActivityChart` — грануляция переключается по данным, stacked-бар корректно делит успешные/нулевые, линия накопления монотонно неубывающая. `FilterFingerprintStrip` — row-relative нормализация цвета, хронологический порядок, N=15/8 по breakpoint, "—" для незаданного year-range.

---

## 3. Компоновка `ExplorePage.tsx` (personal mode)

```
PersonalKpiRow (5 тайлов)
PersonalDimensionDrawer (Sheet, по клику)
PersonalActivityChart (full-width)
FilterFingerprintStrip (full-width, под активностью)
```

Порядок: сначала «что у меня есть» (KPI/drawer — распределения), затем «как я искал» (activity → fingerprint — хронология). CTA-баннер для неавторизованных — без изменений, ниже.

---

## 4. i18n

Новые ключи `en`/`ru`/`sr-Latn`: `explore.personal.kpi.*` (переиспользовать текстовые шаблоны `explore.kpi.*`, где смысл совпадает), `explore.personal.activity.*` (заголовок, подписи легенды successful/zero-result, тултип), `explore.personal.fingerprint.*` (заголовок, подписи 4 строк, "—" для неприменимого фильтра). CI lint job уже проверяет паритет ключей EN↔RU↔SR-LATN — новые ключи обязаны попасть во все 3 файла одновременно.

---

## 5. Тестовое покрытие (пороги проекта: backend fail-under 80%, frontend statements 70%)

Принцип не меняется (см. прецедент `explore-table-builder/spec.md` §4): бизнес-логика/агрегация — исчерпывающе; чистый Recharts JSX — smoke-тестом, вне числителя coverage.

---

## 6. Чек-лист реализации

- [ ] Frontend: `DimensionStatsSource` интерфейс в `types/api.ts`
- [ ] Frontend: рефакторинг `KpiRow`/`DimensionDrawer` на props (`source`/`isLoading`), внешние `<KpiRow />`/`<DimensionDrawer />` без изменений поведения
- [ ] Frontend: `PersonalKpiRow.tsx`/`PersonalDimensionDrawer.tsx` (5 тайлов, без author)
- [ ] Frontend: удалить `PublicationsByYearChart`/`DocumentTypesChart`/`TopCountriesChart`/`TopJournalsChart` (+`.test.tsx`), если не используются больше нигде
- [ ] Backend: `PersonalActivityBucket`/`PersonalActivityResponse` схемы
- [ ] Backend: `get_personal_activity_for_user` (interface + Postgres impl), `.select_from()` явно на всех EXISTS/join-подзапросах
- [ ] Backend: `GET /articles/stats/personal/activity` роутер
- [ ] Backend: тесты (unit + SQLite-integration) на реальном движке — не только мокнутый service-тест
- [ ] Frontend: `getPersonalActivity()` + `getSearchHistory(n?)` в `api/articles.ts`
- [ ] Frontend: `PersonalActivityChart.tsx` (stacked bar + line, авто-грануляция)
- [ ] Frontend: `FilterFingerprintStrip.tsx` (row-relative heat, responsive N, chronological order)
- [ ] Frontend: компоновка в `ExplorePage.tsx` personal mode (§3)
- [ ] i18n — en/ru/sr-Latn ключи §4, CI-паритет
- [ ] Тесты (frontend + backend), визуальная проверка в обеих темах (Chrome DevTools MCP), desktop + mobile
- [ ] Обновить `frontend/CLAUDE.md`/корневой `CLAUDE.md` после мерджа (`post-merge-sync`)

---

## 7. Вне скоупа v1 (зафиксировать, не блокирует старт)

- Cross-filter (`activeSelection`) между personal-графиками — не реализуется в v1.
- Кэширование `/stats/personal/activity` — без кэша, как и `/stats/personal`; пересмотреть только при реальной нагрузке.
- Полная история за пределами retention-окна (100 записей) — недоступна по конструкции ретеншна PR #45, не переосмысливаем в этой работе.
- `author`-измерение для personal KPI/drawer — не добавляется (см. §1.1).
