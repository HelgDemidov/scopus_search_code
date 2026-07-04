# Спецификация: unification KPI+Drawer в personal mode + автобиографический раздел `/explore?mode=personal`

**Статус:** черновик v1 · 2026-07-05
**Ветка:** `feat/explore-personal-redesign`
**Сквозное требование:** каждая новая единица функционала по чек-листу §6 (компонент, эндпоинт, репозиторий-метод) должна сопровождаться адекватным тестовым покрытием — не постфактум одним общим прогоном в конце, а по завершении каждого пункта чек-листа (см. §1.5/§2.3).

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

**Уточнение по факту кода (важно):** `by_open_access` не унифицирован между источниками "из коробки" — `DimensionDrawer.getConfig()` для collection строит 2-элементный breakdown вручную из скалярных `open_access_count`/`total_articles`, тогда как `SearchStatsResponse.by_open_access` уже пришёл готовым массивом с лейблами `'true'`/`'false'` (конвенция `PivotDimension`, см. `postgres_catalog_repo._stringify_dim`). А `KpiRow` вычисляет ЗНАЧЕНИЯ тайлов из скалярных полей (`total_articles`/`total_countries`/`total_journals`/`total_authors`/`open_access_count`), которых в `SearchStatsResponse` нет вообще (там только `total` + `by_*`-массивы) — формулы вычисления value принципиально разные между режимами, унифицировать сами формулы не нужно и не стоит. Отсюда — раздельная стратегия для Drawer (данные унифицируемы) и KpiRow (унифицируем только презентационную оболочку, не вычисление):

1. Ввести общий TS-интерфейс `DimensionStatsSource` (`by_year`/`by_country`/`by_doc_type`/`by_journal`: `LabelCount[]`; `by_open_access: LabelCount[]` — ровно 2 элемента, канонические лейблы `'true'`/`'false'`; `top_authors?: LabelCount[]` — опционально, только collection) в `types/api.ts`.
2. `getConfig()` в `DimensionDrawer.tsx` — сузить тип параметра `stats: StatsResponse | null` → `stats: DimensionStatsSource | null`; ветку `open_access` переписать на чтение `stats.by_open_access.find(d => d.label === 'true'/'false')` вместо прямого вычитания скаляров (уже работает одинаково для обоих источников); ветку `author` — защитный `stats.top_authors ?? []` (для personal она физически недостижима — `author` не входит в список измерений personal-режима, см. п.4).
3. `DimensionDrawer` — перевести на приём `source: DimensionStatsSource | null`/`isLoading`/`dimensions: Dimension[]` (допустимый список измерений — 6 для collection, 5 для personal) через props вместо прямого чтения `useStatsStore` внутри. Для сохранения нулевого риска регрессии в collection mode: оставить `<DimensionDrawer />` как есть внешне (обёртка без пропсов, читает `useStatsStore`, адаптирует `StatsResponse` → `DimensionStatsSource` — включая построение `by_open_access` из `open_access_count`/`total_articles` — и прокидывает вниз в общий презентационный компонент). Новый `PersonalDimensionDrawer` — аналогичная тонкая обёртка над personal-стором (см. §1.3), `SearchStatsResponse` уже структурно совместим с `DimensionStatsSource` (кроме `top_authors`, которого там нет и не нужно), `dimensions` — список из 5 (без `author`).
4. `KpiRow` — иначе: значения тайлов не унифицируются в общий тип, т.к. формулы разные. Вместо этого выделить чисто презентационную `KpiTileRow` (принимает готовый `tiles: {dimension,label,value}[]` + `isLoading`/`drawerDimension`/`onTileClick` — без обращения к какому-либо стору). `KpiRow` (collection, поведение не меняется) — вычисляет свои 6 тайлов из `useStatsStore`, рендерит `<KpiTileRow tiles={...} .../>`. Новый `PersonalKpiRow` — вычисляет свои 5 тайлов (§1.1) из personal-стора, рендерит тот же `<KpiTileRow>`.
5. `dashboardStore`: `drawerDimension`/`openDrawer`/`closeDrawer` — общий стор используется и коллекцией, и personal-обёрткой (single Sheet instance на весь `ExplorePage`, т.к. режимы взаимоисключающие — переключение между `mode=collection`/`mode=personal` уже закрывает предыдущий вид). Проверить: при смене `mode` drawer должен закрываться (`closeDrawer()` в `useEffect` на смену `mode`), иначе возможен edge-case открытого drawer с "залипшим" измерением после переключения.

### 1.3 Данные

Без нового стора. `ExplorePage.tsx` уже хранит `personalStats`/`personalLoading` (локальный `useState`, `getPersonalStats()`) — прокидывать этот же state пропсами в `PersonalKpiRow`/`PersonalDimensionDrawer` (`stats: SearchStatsResponse | null`, `isLoading: boolean`), без изменений бэкенда и без дублирующего фетча. `SearchStatsResponse` уже структурно satisfies `DimensionStatsSource` (см. §1.2) — адаптер не нужен, `stats` передаётся как есть.

### 1.4 Что удаляется

`PublicationsByYearChart`/`DocumentTypesChart`/`TopCountriesChart`/`TopJournalsChart` — удалить вместе с `.test.tsx`. **Уточнение по факту (проверено при реализации):** помимо `ExplorePage.tsx`, все 4 использовал ещё и `SearchResultsDashboard.tsx` — но сам этот компонент оказался мёртвым кодом (не импортируется ни из одного живого route/родителя, только устаревший `vi.mock` в `HomePage.test.tsx`, сам `HomePage.tsx` его не рендерит). Удалён вместе с 4 чартами и осиротевшим mock'ом в `HomePage.test.tsx`.

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

---

## 8. Post-prod fix (2026-07-06, после мерджа PR #46 в main)

Правки визуального полиша `PersonalActivityChart`/`FilterFingerprintStrip` по итогам живого просмотра прод-версии (`/explore?mode=personal`). Реализовано прямо в `main`, без отдельной ветки.

**8.1 `PersonalActivityChart`**
- Бары `successful_searches`/`zero_result_searches` были во всю ширину категории (Recharts default) — визуально "топорно" на малом числе периодов. Кап `maxBarSize={32}` + `barCategoryGap="35%"` на `ComposedChart`.
- Пробовали (1) градиентную заливку баров (`<linearGradient>`, top opaque → bottom 0.6 opacity — по аналогии с `drawerYearGrad` в `DimensionDrawer`, единственным существующим прецедентом градиента в проекте, хоть и на Area, не Bar) и (2) цвет `DIMENSION_COLORS.author.base` (sky-600) вместо `year.base` (blue-600, конфликтовал с Publications by Year/KPI-тайлом на той же странице) — **откачено по правке пользователя**: оставлен плоский `year.base`, без градиента. Итог: только `maxBarSize`/`barCategoryGap`, цвет и заливка не менялись относительно исходной реализации.
- Легенда (`Successful searches` / `Zero-result searches` / `Articles collected`): Recharts `DefaultLegendContent` даёт фиксированный ~10px зазор между пунктами (смотрелось тесно) — заменена на кастомный `content` (компонент `ActivityLegend`, тот же приём, что `JournalCountryLegend` в `TopJournalsByCountryChart.tsx`), `gap-x-6` (24px) между пунктами. Проверено эмпирически (Chrome DevTools `getComputedStyle`/`getBoundingClientRect`): размер шрифта легенды (`text-xs` = 12px) совпадает с шрифтом тиков осей (`fontSize: 12` в recharts), фактический зазор между пунктами — 24px. Оставлено без изменений.

**8.2 `FilterFingerprintStrip`**
- Угловая ячейка шапки была пустой — добавлен явный заголовок `explore.personal.fingerprint.rowDate` ("Date"/"Дата"/"Datum", новый i18n-ключ en/ru/sr-Latn).
- Строка "Zero-result searches" убрана целиком (была визуально пустой на существующих прод-аккаунтах — вся история старше фикса `find_and_save`, см. память `project-zero-result-search-not-recorded-bug`, читалось как баг интерфейса, а не как "пока нет данных"). Сигнал перенесён в шапку даты: маленькая amber-точка (`ZERO_RESULT_COLOR`) под датой того столбца, где `isZeroResult`.
- Таблица была left-clustered (colspan/ширина по контенту, много пустого места справа при малом числе поисков на широкой карточке) — `<table className="w-full ...">` заставляет auto-layout распределять свободную ширину карточки между столбцами. Кап `max-w-[112px]` на все ячейки данных (шапка + 4 строки) — иначе при 1-3 поисках (мало данных) те же 2-3 столбца растягивались бы на всю ширину карточки (пусто-широкие блоки под одну цифру); с капом лишняя ширина просто остаётся пустой справа, столбцы не раздуваются.
- Вертикальная теснота (шапка стала визуально тяжелее с текстом "Date") — `mt-2` на scroll-обёртку (доп. отступ от заголовка карточки) + `border-b` под строкой шапки (визуально отделяет её от строк данных) + `py-2` вместо `py-1` в ячейках шапки.
- Горизонтальная прокрутка (оба графика, п.6 брифа): `FilterFingerprintStrip` уже имел нативный `overflow-x-auto` (браузерный скроллбар) — оставлен как есть, кастомный слайдер не добавлен (нет прецедента такого паттерна в проекте, `w-full` уже решает типичный случай 8–15 столбцов). `PersonalActivityChart` — Recharts `ResponsiveContainer` не имеет механизма скролла вообще, бары сжимаются под контейнер (как и все остальные графики дашборда); кол-во периодов физически ограничено `HISTORY_DEPTH_LIMIT=100`, отдельный скролл/слайдер не оправдан.

**Тесты:** `FilterFingerprintStrip.test.tsx` (+3: заголовок "Date", zero-result маркер в шапке вместо строки), `PersonalActivityChart.test.tsx` — без изменений в структуре assertions (мок recharts не проверял конкретные fill/gradient значения). Полный фронтенд-прогон + lint + build — зелёные (детали в конце ТЗ/отчёте).
