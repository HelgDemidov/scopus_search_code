# Спецификация: Journal Landscape Scatter (4-й фикс-график) + Table Builder вместо Chart Builder

**Статус:** черновик v1 · 2026-07-03
**Ветка:** `feat/explore-table-builder`
**Контекст:** проект учебно-демонстрационный (не коммерческий) — цели: (1) освоить широкий инструментарий дизайна/бэкенда/видов инфографики, (2) портфолио для показа работодателю глубины анализа и качества UX. Внедрение веса ради веса — не задача; каждый новый компонент должен демонстрировать отдельный, ещё не показанный навык.
**Предпосылка:** диалог-анализ в текущей сессии (не отдельный документ) + прецедент `docs/explore-cross-analytics/spec.md` (PR #43, 3 фикс-графика, паттерны `AXIS_COLORS`/`getCountryColor`/`.recharts-sector:focus` и т.д.)

---

## 0. Что меняется и почему (согласовано в диалоге)

1. **`ChartBuilderPanel` (флоское, одномерное, 6 dimensions) — удаляется целиком.** Все 6 его измерений уже дублируют `KpiRow` → `DimensionDrawer` (проверено по коду: `KpiRow.tsx:34-40` открывает `DimensionDrawer` ровно на те же 6 dimension). Табличный режим — единственное, чего drawer не даёт, — становится ядром замены (п.2).
2. **Journal Landscape Scatter** — новый **4-й фиксированный** full-width график (не элемент конструктора): X = объём статей журнала, Y = среднее цитирование, точка = журнал. Стоит по архитектуре особняком — комбинирует не 2 категориальных измерения, а 1 измерение (`journal`) × 2 метрики, поэтому не ложится ни на модель KPI/drawer, ни на модель pivot-таблицы.
3. **Table Builder** — новый конструктор **только таблиц** (не графиков), покрывающий 10 согласованных пар категориальных измерений (§4) + управление 3-м измерением через **slicer** (фильтр), а не честный 3-way GROUP BY (прецедент: 3-уровневый Sunburst уже был отклонён в PR #43 из-за нечитаемости — см. `explore-cross-analytics/spec.md`, «Статус выполнения»).
4. **Архитектурный сдвиг**, общий для обеих фич: вместо накопления новых полей в `StatsResponse` (паттерн 3 старых фикс-графиков) — **параметризованные, отдельные, ленивые (on-demand) эндпоинты**, не встроенные в 60с-кэш `get_stats()`.

---

## 1. Journal Landscape Scatter

### 1.1 Метрика и окно зрелости

- X = `count(articles)` по журналу, Y = `avg(cited_by_count)` по журналу (медиана непригодна — проверено: у 19 из 20 крупнейших журналов медиана цитирования = 0 при полной истории).
- **Окно зрелости — интерактивный слайдер с одним ползунком**, значение = "учитывать статьи, опубликованные ≤ год X". Переиспользовать `<Slider>` + паттерн `constants/yearRange.ts` (уже есть в `TopCountriesByYearChart`).
- **Границы слайдера: 2022–2024, по умолчанию 2024.** Обоснование (проверено на проде `btmiovdmasqufufyuokx`):
  - нижняя граница 2022 — ниже неё < 30 журналов набирают минимальный N (см. §1.2), график на левом краю слайдера выглядел бы пусто;
  - верхняя граница 2024 — включение 2025+ статей систематически занижает среднее цитирование новых когорт (2025: 45.1% статей с 0 цитирований, mean=2.94; 2026: 83.9% с нулём) и искажает сравнение журналов не по качеству, а по "свежести" портфеля.
- Диапазон узкий (3 позиции) осознанно — отражает реальную зрелость коллекции (быстрорастущая тема AI/NN), не UI-компромисс.

### 1.2 Минимальный N и top-N

- Включать в scatter только журналы с **N ≥ 20** статей в выбранном окне (иначе среднее статистически шумное).
- Показывать **top 30–40 по объёму** среди прошедших фильтр N≥20.
- Пример устойчивости: при cutoff=2024 → 125 журналов проходят N≥20, топ-15 по объёму дают правдоподобный, проверяемый на здравый смысл рейтинг (Nature Communications mean=80.8/median=52; CVPR proceedings mean=89.4/median=35; IEEE TNNLS mean=63.0/median=22 — наверху; Proceedings of SPIE mean=1.8/median=1 — внизу).

### 1.3 Бэкенд

Новый **отдельный, параметризованный, вне `get_stats()`** эндпоинт (обоснование: значение зависит от рантайм-параметра слайдера, кэшировать в статичном `StatsResponse` бессмысленно):

```
GET /articles/stats/journal-impact?max_year=2024
```

- `max_year` — валидация `2022 <= max_year <= 2024` (422 при выходе за диапазон).
- Ответ — `list[JournalImpactPoint]`, где:
  ```python
  class JournalImpactPoint(BaseModel):
      journal: str
      count: int
      mean_citations: float
      median_citations: float
  ```
- Репозиторий: `GROUP BY journal WHERE extract(year from publication_date) <= :max_year HAVING count(*) >= 20 ORDER BY count DESC LIMIT 40`.
- Существующие функциональные индексы (`lower(document_type)` и т.п., migration `0014`) сюда не относятся — группировка идёт по `journal`/`publication_date`, не по `document_type`/`affiliation_country`; отдельного индекса не требуется при текущем объёме таблицы (121k строк), но приложить `EXPLAIN ANALYZE` в PR как проверку.

### 1.4 Фронтенд

- `JournalLandscapeScatterChart.tsx` — full-width, лениво импортируется в `ExplorePage.tsx` (тот же `lazy()`-паттерн, что 3 существующих графика), располагается **после** ряда `[CountrySunburstChart | TopJournalsByCountryChart]`, перед Table Builder.
- Recharts `ScatterChart`/`Scatter` — новый примитив в проекте, `rootTabIndex={-1}` и `.recharts-sector:focus{outline:none}`-подобный фикс проверить отдельно для `.recharts-symbols` (может не воспроизводиться — Scatter рендерит `<path>`/`<circle>` иначе, чем `Pie`).
- Лог-шкала по Y (`scale="log"` в `<YAxis>`) — обязательна, выбросы остаются даже в зрелом окне (max по отдельным журналам — сотни/тысячи цитирований).
- Цвет точки — по квадранту (медианы X/Y выбранного набора делят на 4 зоны), не единым цветом. 4 фиксированных цвета, согласованных с общей палитрой (`chartColors.ts`), не новый произвольный набор.
- Референсные линии медиан (`<ReferenceLine>`) — визуально размечают квадранты.
- Тултип — журнал, N, mean, median, квадрант (переиспользовать паттерн `ChartTooltip`/кастомный content, как в 3 существующих графиках).
- i18n — новые ключи `explore.crossCharts.journalImpact.*` в en/ru/sr-Latn (заголовок, подписи осей, названия квадрантов, disclaimer про окно зрелости).

---

## 2. Удаление `ChartBuilderPanel` (флоского)

- Удалить: `ChartBuilderPanel.tsx` (+`.test.tsx`), `DynamicChart.tsx` (+`.test.tsx`) — используемая только там логика (`PIE_PALETTE`, `sliceForType`, `getDataForDimension` для чартов) уходит вместе с ними.
- `dashboardStore.ts`: `BuilderCard { dimension, chartType }` → заменить на новую форму под table builder (см. §3.4). Проверить персист-схему (`partialize`/`migrate` в сторе) — версию персиста поднять, т.к. форма `BuilderCard` меняется несовместимо.
- `DIMENSION_OPTIONS`, `chartTypeLabels`, связанные i18n-ключи `explore.chartTypes.*` — удалить, если больше нигде не используются (проверить `DimensionDrawer`/`KpiRow` не завязаны на них — по чтению кода не завязаны, у них свои лейблы).

---

## 3. Table Builder

### 3.1 Whitelist измерений и пар (10 шт., согласовано)

Базовые измерения: `year`, `country`, `doc_type`, `journal`, `open_access`. **`author` исключён из всех комбинаций** (нет ORCID, риск ложной агрегации по однофамильцам — уже задокументированная причина исключения из Приложения A `explore-cross-analytics/spec.md`); остаётся только как существующий один­мерный срез (уже работает, не трогаем).

| # | Пара (rows × cols) |
|---|---|
| 1 | year × country |
| 2 | year × doc_type |
| 3 | year × open_access |
| 4 | year × journal |
| 5 | country × doc_type |
| 6 | country × open_access |
| 7 | country × journal |
| 8 | doc_type × open_access |
| 9 | doc_type × journal |
| 10 | open_access × journal |

### 3.2 Slicer (3-е измерение — фильтр, не ось)

- Опциональный 3-й контрол: «Показать только: `<измерение>` = `<значение>`».
- Список измерений слайсера = оставшиеся 3 из 5 (минус уже выбранные rows/cols), **включая `journal`/`country` через поиск** (переиспользовать существующий `MultiSelectCombobox`), но **не рекомендуется как slicer для `journal`** при уже высококардинальной оси (row/col) — UI должен предупреждать, если результат вырождается (< 5 непустых ячеек).
- Реализация — не новый агрегат, а доп. `WHERE`-параметр в том же pivot-эндпоинте (§3.3).

### 3.3 Бэкенд — один параметризованный pivot-эндпоинт

```
GET /articles/stats/pivot?row_dim=year&col_dim=country&top_n_rows=20&top_n_cols=15&filter_dim=doc_type&filter_value=Article
```

- **Whitelist на сервере** — `row_dim`/`col_dim`/`filter_dim` валидируются через `Enum`/dict-маппинг измерение→реальная SQL-колонка; **никогда** не интерполировать сырую строку клиента в `GROUP BY`/`ORDER BY` (SQL-инъекция). Отклонять пары не из списка §3.1 (422).
- `top_n_rows`/`top_n_cols` — обязательный контрол truncation для высококардинальных осей (`journal`: 13 502 значения, `country`: ~150) — без него pivot на 2 таких осях даёт нечитаемую простыню.
- Ответ:
  ```python
  class PivotResponse(BaseModel):
      row_dim: str
      col_dim: str
      row_labels: list[str]
      col_labels: list[str]
      matrix: list[list[int]]      # counts, [row][col]
      row_totals: list[int]
      col_totals: list[int]
  ```
- **Не встраивать в `get_stats()`/Redis-кэш** — ленивая загрузка по клику пользователя в конкретную комбинацию; отдельный, некэшированный (или отдельно кэшируемый под собственным TTL/ключом позже, вне скоупа v1) запрос.
- Cross-filter (`activeSelection` из `dashboardStore`) — v1 **не наследует** (отдельный некэшированный эндпоинт, самостоятельный источник правды); если понадобится — отдельная итерация.

### 3.4 Фронтенд

- `TableBuilderPanel.tsx` заменяет `ChartBuilderPanel.tsx` в `ExplorePage.tsx` (то же место, кнопка `+ Add table`/переименовать `explore.chartBuilder.addChart` → `explore.tableBuilder.addTable`).
- UI-механика выбора: 2 колонки (rows/cols) — оставляем 2-шаговый выбор из первоначальной идеи (естественно ложится на 10 валидных пар из 5 измерений), + опциональный 3-й slicer-контрол под ними.
- `PivotTable.tsx` — новый компонент (не переиспользование плоского `DataTable` из старого `DynamicChart` — там другая, одномерная форма данных):
  - сортировка по клику на заголовок столбца (включая по `row_totals`);
  - поиск/фильтр по подписи строки (полезно при `top_n_rows` до 20+, особенно `journal`/`country`);
  - пагинация, если строк > ~30 после truncation;
  - **CSV-экспорт** — кнопка «Скачать CSV», UTF‑8 **с BOM** (кириллица в RU/sr-Latn лейблах иначе бьётся в Excel на Windows), корректное RFC4180-экранирование запятых/кавычек в подписях.
- `BuilderCard` (новая форма в `dashboardStore.ts`): `{ id, rowDim, colDim, filterDim?, filterValue? }`.
- Стиль — переиспользовать `AXIS_COLORS`, типографику/паддинги существующего `ChartCard`, не изобретать новую цветовую систему для таблицы.
- i18n — `explore.tableBuilder.*` (замена `explore.chartBuilder.*`), + подписи 10 пар, slicer, CSV-кнопки — en/ru/sr-Latn, CI-проверка паритета ключей (уже есть в lint job).

---

## 4. Минимально достаточное тестовое покрytie (по порогам проекта: backend fail-under 80%, frontend statements 70%)

Принцип (соответствует уже принятой в проекте практике — `components/charts/` исключены из coverage как "Recharts passthrough", но чистые функции подготовки данных типа `crossChartData.ts` тестируются полностью): **бизнес-логика и валидация — тестируются исчерпывающе; чистый Recharts JSX-рендеринг — лёгким smoke-тестом/вне coverage-числителя.**

### Backend (`tests/unit/` + `tests/integration/`, SQLite — PG-специфики здесь нет)

- `journal-impact`: корректная фильтрация по `max_year` (граничные значения 2022/2024), отклонение `max_year` вне диапазона (422), HAVING count>=20 отсекает малые выборки, top-40 truncation, сортировка по count DESC, пустой результат (нет данных) не падает.
- `pivot`: **обязательный security-тест** — попытка передать `row_dim`/`col_dim` не из whitelist → 422, не должно быть SQL-инъекции (параметризованный тест на спецсимволы в значении `filter_value`); корректный GROUP BY для каждой из 10 пар (хотя бы happy-path на 2-3 показательных парах, не обязательно все 10 по отдельности); `top_n_rows`/`top_n_cols` truncation; slicer (`filter_dim`+`filter_value`) сужает результат корректно; пустая комбинация (нет строк, удовлетворяющих фильтру) не падает.
- Оба эндпоинта — unit (мокнутый repo/service) + integration (реальная SQLite сессия с фикстурными данными, `tests/conftest.py`).

### Frontend (co-location, `*.test.tsx`)

- `JournalLandscapeScatterChart`: слайдер зажат в [2022, 2024], дефолт 2024, смена значения триггерит перезапрос, квадрант-цвет считается корректно от медиан набора, лоадинг/пустое состояние.
- `TableBuilderPanel`: рендер 10 валидных пар, невалидная пара недоступна для выбора, slicer появляется/пропадает при смене rows/cols, добавление карточки в `dashboardStore`.
- `PivotTable`: сортировка по столбцу, поиск/фильтр по строке, пагинация, **CSV-экспорт — тест самой чистой функции генерации CSV-строки** (эскейпинг запятых/кавычек, BOM-префикс) отдельно от DOM-скачивания (второе — не юнит-тестируемо в jsdom, не требуется).
- `dashboardStore`: миграция персиста при смене формы `BuilderCard` (старые сохранённые карточки из localStorage не должны ронять стор).

---

## 5. Чек-лист реализации

- [x] Backend: `JournalImpactPoint`/`PivotResponse` схемы (`app/schemas/article_schemas.py`)
- [x] Backend: `GET /articles/stats/journal-impact` (роутер + сервис + репозиторий-метод + whitelist/валидация)
- [x] Backend: `GET /articles/stats/pivot` (роутер + сервис + репозиторий-метод + whitelist + security-тест инъекций)
- [x] Backend: тесты (unit + SQLite-integration) для обоих эндпоинтов
- [x] Frontend: `JournalLandscapeScatterChart.tsx` (+ слайдер, квадрант-цвета, лог-шкала, i18n)
- [x] Frontend: удалить `ChartBuilderPanel.tsx`/`DynamicChart.tsx` (+ их `.test.tsx`)
- [x] Frontend: `TableBuilderPanel.tsx` + `PivotTable.tsx` (сортировка/поиск/пагинация/CSV)
- [x] Frontend: `dashboardStore.ts` — новая форма `BuilderCard`, миграция персиста
- [x] Frontend: i18n — `explore.crossCharts.journalImpact.*`, `explore.tableBuilder.*` (en/ru/sr-Latn)
- [x] `ExplorePage.tsx` — разместить scatter (full-width, после ряда sunburst/journals) + заменить builder-секцию
- [x] Тесты (frontend + backend), визуальная проверка в обеих темах (Chrome DevTools MCP), desktop + mobile
- [x] Обновить `frontend/CLAUDE.md`/корневой `CLAUDE.md` после мерджа (см. `post-merge-sync`)

---

## 6. Открытые вопросы вне скоупа v1 (зафиксировать, не блокируют старт)

- Cross-filter (`activeSelection`) для pivot-таблиц — не наследуется в v1, отдельная итерация при необходимости.
- Кэширование `pivot`-эндпоинта — v1 без кэша (некритичная нагрузка при штучных запросах из UI); если станет узким местом — отдельный Redis-ключ вне `db_namespace`-схемы `get_stats()`.
- XLSX/JSON-экспорт — не требуется, CSV закрывает сценарий; пересмотреть только по явному запросу.

---

## 7. Статус выполнения

Смёрджено в `main` 2026-07-03, PR [#44](https://github.com/HelgDemidov/scopus_search_code/pull/44) (merge-коммит `1d76d2d`).

Коммиты: `b167020` (ТЗ) → `f0da94e` (backend: `/stats/journal-impact` + `/stats/pivot`, `JournalLandscapeScatterChart`) → `0214844` (`TableBuilderPanel`/`PivotTable`) → `3e2c5f4` (стиль кнопки Add table) → `de7fe95` (ruff format, CI fix). Пост-мердж полировка отдельным коммитом в `main`: `43930e7` (контраст/выравнивание/фиолетовый акцент кнопки Table Builder, сброс сортировки по 3-му клику, размер шрифта Sign in/Add table).

Реализовано полностью по чек-листу §5, включая визуальную проверку в обеих темах и на мобильном экране (Chrome DevTools MCP). Backend: 183 теста (`pytest -m "not requires_pg"`). Frontend: 527 тестов, tsc/eslint чистые.

Открытые вопросы §6 остаются вне скоупа v1 без изменений.
