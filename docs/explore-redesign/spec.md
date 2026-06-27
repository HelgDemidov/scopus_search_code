# Спецификация: редизайн страницы /explore

**Статус:** черновик v1 · 2026-06-27  
**Приоритет:** пилотный участок дизайн-системы (впоследствии распространяется на весь сайт)  
**Исполнитель:** Claude Code  
**Решение о стеке:** Recharts (напрямую) + shadcn/ui + Tailwind 3  

---

## 1. Критический разбор исходных предложений

### 1.1 Cross-filtering: что реально возможно

**Проблема.** Настоящий cross-filter (как в Dimensions.ai) требует, чтобы клик по стране «China» пересчитывал числа во всех остальных графиках: сколько статей по типам, журналам и годам среди _только китайских_. Это требует серверных агрегаций с фильтрами: `GET /articles/stats?country=China`. Текущий `/articles/stats` возвращает глобальные топ-20 без фильтров. Загружать все 39 K+ статей на клиент нереально.

**Вывод по реализации:**

| Уровень | Что реализуется | Что нужно |
|---|---|---|
| **V1 — визуальное выделение** | Клик по бару/сектору: выбранный подсвечивается, остальные диммируются. Другие графики не меняются. | Только фронтенд — `dashboardStore.activeSelection` |
| **V2 — фильтрованные агрегаты** | Клик по «China» пересчитывает все остальные чарты под Китай. | Новый эндпоинт `GET /articles/stats?countries[]=...&doc_types[]=...` |

**Рекомендация:** V1 реализуем сейчас; V2 — отдельный бэкенд тикет. Визуально V1 уже производит впечатление интерактивности.

### 1.2 Right panel vs иные паттерны drill-down

Dimensions.ai использует **sliding drawer** (slide-in panel справа, перекрывает контент на тёмном backdrop, не сжимает grid). Это лучше, чем right panel рядом с grid: при 2×2 grid сжатие сломает пропорции. **Принятое решение:** floating right drawer (Sheet из shadcn/ui) на 45% ширины viewport, backdrop `bg-black/30`.

### 1.3 `top_keywords` — критическое замечание

Поле `top_keywords` в ответе `/articles/stats` содержит **фразы сидера** (запросы, которыми сидер наполнял БД: «machine learning for medical imaging»), а не ключевые слова авторов статей из метаданных Scopus. Это тематические кластеры коллекции, а не авторские теги. **Вывод:** визуализировать как «Thematic Areas» (тематические направления), не «Top Keywords» — иначе пользователь неверно интерпретирует.

### 1.4 KPI tiles: расширение с 4 до 6

Текущие 4 тайла (Articles, Countries, Open Access, Doc Types). Добавить: **Top Journals** (total_journals уже есть в ответе) и **Thematic Areas** (count из top_keywords). Итого 6 тайлов в row, каждый кликабелен и открывает соответствующий drawer.

### 1.5 Chart Builder: уточнение scope V1

V1 chart builder работает _только_ с данными, которые уже загружены из `/articles/stats`. Он позволяет выбрать измерение (6 вариантов) и тип чарта (bar horizontal, bar vertical, pie/donut, line, table). Новых запросов к API не делает. Сгенерированные чарты добавляются как карточки ниже основного grid и могут быть удалены.

---

## 2. Страница: структура и компоновка

```
┌─────────────────────────────────────────────────────────────────────┐
│ Section header: "Collection Analytics"  [subtitle: коллекция + дата]│
├─────────────────────────────────────────────────────────────────────┤
│  [KPI Row — 6 тайлов, каждый кликабелен]                           │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐           │
│  │39.8K │ │ 146  │ │43.2K │ │  12  │ │  20+ │ │4.7K  │           │
│  │Art.  │ │Ctry  │ │  OA  │ │DocT  │ │Journ.│ │Topics│           │
│  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘           │
├─────────────────────────────────────────────────────────────────────┤
│  [Pinned: Publications by Year — полная ширина]                     │
│  AreaChart · синяя · 1990–2025 · hover tooltip                     │
├────────────────────────────┬────────────────────────────────────────┤
│  Top Countries             │  Document Types                        │
│  HorizontalBar · emerald   │  HorizontalBar · violet                │
├────────────────────────────┼────────────────────────────────────────┤
│  Top Journals              │  Open Access Status                    │
│  HorizontalBar · amber     │  Donut · teal (OA vs non-OA)          │
├────────────────────────────┴────────────────────────────────────────┤
│  Thematic Areas (top_keywords)                                      │
│  HorizontalBar · rose · top-15 · полная ширина                     │
├─────────────────────────────────────────────────────────────────────┤
│  [+ Add chart]  ← Chart Builder trigger                            │
│  [динамические пользовательские карточки, если добавлены]           │
└─────────────────────────────────────────────────────────────────────┘

                ↑ при клике на KPI или bar-элемент:
┌────────────────────────────────────────────────────────┐
│ [backdrop dim]  ┌─────────────────────────────────────┐│
│                 │  Drawer (45vw)                      ││
│                 │  Заголовок: «Countries — detail»    ││
│                 │  Полный список (не топ-20): table   ││
│                 │  + крупный чарт                     ││
│                 │  [×] close                          ││
│                 └─────────────────────────────────────┘│
└────────────────────────────────────────────────────────┘
```

---

## 3. Измерения и источники данных

| Измерение | API-поле | Чарт в grid | Чарт в drawer | Цвет |
|---|---|---|---|---|
| Publications by Year | `by_year` | AreaChart (pinned) | BarChart + table | blue |
| Countries | `by_country` | HorizontalBar top-10 | BarChart full list + table | emerald |
| Document Types | `by_doc_type` | HorizontalBar (все) | Donut + table | violet |
| Top Journals | `by_journal` | HorizontalBar top-10 | BarChart full list + table | amber |
| Open Access | `open_access_count` / `total_articles` | Donut (OA vs non-OA) | Stacked bar по годам* | teal |
| Thematic Areas | `top_keywords` | HorizontalBar top-15 | Word cloud** или table | rose |

\* OA по годам: нет данных в текущем API — для V1 drawer показывает donut + числа (%.  
\*\* Word cloud: опциональна (нет готового компонента в Recharts); V1 — таблица с count bars.

**Backend изменения для V1: не требуются.** OA ratio вычисляется на клиенте: `oa_ratio = open_access_count / total_articles`.

---

## 4. Взаимодействия (interaction model)

### 4.1 Клик по KPI тайлу
1. `dashboardStore.openDrawer(dimension)` 
2. Drawer slide-in справа с анимацией 300ms
3. Backdrop `bg-black/30` кликабелен → закрыть

### 4.2 Клик по элементу чарта в grid (V1 — визуальное выделение)
1. `dashboardStore.setSelection({ dimension, value })`
2. Все 5 grid-чартов читают `activeSelection` из store
3. В выбранном чарте: выбранный бар → полный цвет, остальные → `opacity-30`
4. В остальных чартах: нет изменений данных, нет диммирования (V1)
5. Повторный клик по тому же элементу → сбросить selection

### 4.3 Chart Builder
1. Кнопка `+ Add chart` (внизу страницы)
2. Открывается inline panel (не drawer): выбор измерения (radio) + выбор типа чарта
3. После подтверждения: новая карточка добавляется в `builderCards` (Zustand array)
4. Карточка имеет `[×]` для удаления
5. `builderCards` не персистируется (сессионное состояние)

### 4.4 Hover tooltips на всех чартах
Recharts `<Tooltip>` с единым кастомным компонентом `ChartTooltip` — форматирование чисел с разделителями, цветовой маркер измерения.

---

## 5. Дизайн-система

### 5.1 Цветовой код (один цвет = одно измерение)

Каждое измерение имеет базовый цвет (Tailwind) + 3 производных состояния:

| Измерение | Base (bar fill) | Hover | Selected | Dimmed |
|---|---|---|---|---|
| Year | `#2563eb` (blue-600) | `#1d4ed8` | `#1d4ed8` | `#bfdbfe` (blue-200) |
| Countries | `#16a34a` (green-600) | `#15803d` | `#15803d` | `#bbf7d0` (green-200) |
| Doc Types | `#7c3aed` (violet-600) | `#6d28d9` | `#6d28d9` | `#ddd6fe` (violet-200) |
| Journals | `#d97706` (amber-600) | `#b45309` | `#b45309` | `#fde68a` (amber-200) |
| Open Access | `#0d9488` (teal-600) | `#0f766e` | `#0f766e` | `#99f6e4` (teal-200) |
| Thematic Areas | `#e11d48` (rose-600) | `#be123c` | `#be123c` | `#fecdd3` (rose-200) |

Константы выносятся в `frontend/src/components/charts/chartColors.ts` (уже существует, расширить).

### 5.2 Типографика

| Роль | Класс Tailwind |
|---|---|
| KPI число | `text-3xl font-bold tracking-tight text-slate-900` |
| KPI подпись | `text-xs font-medium text-slate-500 uppercase tracking-wide` |
| Заголовок чарта | `text-sm font-semibold text-slate-900` |
| Ось, тикеты | `text-[11px] fill-slate-400` (через Recharts tick props) |
| Tooltip значение | `text-sm font-semibold` |
| Section header | `text-2xl font-bold text-slate-900` |

### 5.3 Карточка (chart card)

Единый контейнер для всех чартов:
```
rounded-xl border border-slate-200 bg-white p-5 flex flex-col gap-3
shadow-sm hover:shadow-md transition-shadow
```

KPI тайл — интерактивный вариант:
```
cursor-pointer ring-2 ring-transparent hover:ring-{color}-300
data-[active=true]:ring-{color}-500 data-[active=true]:bg-{color}-50
transition-all
```

### 5.4 Высоты чартов (решает проблему overlap)

| Чарт | Высота | Обоснование |
|---|---|---|
| Publications by Year (AreaChart) | `h-56` | временной ряд, достаточно |
| Countries HorizontalBar (top-10) | `h-72` | 10 × ~29px |
| Doc Types HorizontalBar | `h-48` | обычно 5-8 типов |
| Top Journals HorizontalBar (top-10) | `h-72` | 10 × ~29px |
| Open Access Donut | `h-56` | 2 сегмента |
| Thematic Areas HorizontalBar (top-15) | `h-[360px]` | 15 × ~24px |

### 5.5 Y-axis label truncation (для всех HorizontalBar)

Единая utility-функция `truncateLabel(s: string, n = 28): string` в `chartColors.ts`.
Recharts принимает кастомный `<YAxis tick={CustomYAxisTick}>` — рендерим `<text>` через SVG с `textOverflow`.

---

## 6. Компонентная структура (файлы)

```
frontend/src/
├── stores/
│   └── dashboardStore.ts          # NEW: activeSelection, drawerState, builderCards
├── components/charts/
│   ├── chartColors.ts             # EXTEND: цвета × 6 измерений + truncateLabel
│   ├── ChartTooltip.tsx           # NEW: единый tooltip
│   ├── ChartCard.tsx              # NEW: оболочка-карточка с заголовком
│   ├── PublicationsByYearChart.tsx # REWRITE: Recharts AreaChart
│   ├── TopCountriesChart.tsx      # REWRITE: Recharts BarChart horizontal
│   ├── DocTypesChart.tsx          # REWRITE: Recharts BarChart horizontal
│   ├── TopJournalsChart.tsx       # REWRITE: Recharts BarChart horizontal
│   ├── OpenAccessChart.tsx        # NEW: Recharts PieChart (donut)
│   ├── ThematicAreasChart.tsx     # NEW: Recharts BarChart horizontal
│   └── ChartBuilder/
│       ├── ChartBuilderPanel.tsx  # NEW: selector UI
│       └── DynamicChart.tsx       # NEW: рендерит любой тип чарта по конфигу
├── components/explore/
│   ├── KpiTile.tsx                # NEW/REFACTOR: кликабельный тайл
│   ├── KpiRow.tsx                 # NEW: ряд из 6 тайлов
│   └── DimensionDrawer.tsx        # NEW: Sheet из shadcn с детальным видом
└── pages/
    └── ExplorePage.tsx            # REWRITE: новая компоновка
```

---

## 7. State management

Новый `dashboardStore` (Zustand):

```typescript
interface DashboardState {
  // Cross-filter selection (V1: только визуальное выделение)
  activeSelection: { dimension: Dimension; value: string } | null
  setSelection: (sel: DashboardState['activeSelection']) => void
  clearSelection: () => void

  // Drawer
  drawerDimension: Dimension | null
  openDrawer: (d: Dimension) => void
  closeDrawer: () => void

  // Chart Builder
  builderCards: BuilderCard[]
  addBuilderCard: (card: BuilderCard) => void
  removeBuilderCard: (id: string) => void
}

type Dimension = 'year' | 'country' | 'doc_type' | 'journal' | 'open_access' | 'thematic'

interface BuilderCard {
  id: string
  dimension: Dimension
  chartType: 'bar_h' | 'bar_v' | 'pie' | 'line' | 'table'
}
```

---

## 8. Chart Builder: спецификация

### UI
```
[ + Add chart ]  ← кнопка внизу страницы

При клике раскрывается inline panel (accordion):
  ┌─────────────────────────────────────────────────────┐
  │  Choose dimension:                                  │
  │  ○ Publications by Year   ○ Countries               │
  │  ○ Document Types         ○ Top Journals            │
  │  ○ Open Access            ○ Thematic Areas          │
  │                                                     │
  │  Choose chart type:                                 │
  │  [Bar H] [Bar V] [Pie] [Line*] [Table]              │
  │  * Line доступен только для Year                    │
  │                                                     │
  │  [Add to page]  [Cancel]                            │
  └─────────────────────────────────────────────────────┘
```

### Ограничения chart type per dimension

| Dimension | Bar H | Bar V | Pie | Line | Table |
|---|---|---|---|---|---|
| Year | — | ✓ | — | ✓ | ✓ |
| Countries | ✓ | — | ✓ (top-5) | — | ✓ |
| Doc Types | ✓ | ✓ | ✓ | — | ✓ |
| Journals | ✓ | — | — | — | ✓ |
| Open Access | — | ✓ | ✓ | — | ✓ |
| Thematic | ✓ | — | — | — | ✓ |

---

## 9. Тестовое покрытие

### Принципы

Тесты не ради галочки: каждый тест-кейс защищает конкретное поведение, которое **молча сломается** при рефакторинге без теста.

- **Unit-тесты**: логика хранилища и утилиты — чистые функции, нет DOM, нет side-effects.
- **Component-тесты**: UI-контракты компонентов (skeleton при loading, aria-states, обработчики).
- **Integration-тесты**: взаимодействие нескольких сторов через UI — KpiRow как smart component.
- **Cross-filter тесты**: цвета Cell при разных состояниях selection — через `data-fill` атрибут в мок-компонентах. Recharts мокируется целиком; тестируем поведение нашего кода, не SVG-рендеринг библиотеки.

### Матрица покрытия (Phase 1–2)

| Файл | Тип | Тест-файл | Что тестируется |
|---|---|---|---|
| `dashboardStore.ts` | Unit | `dashboardStore.test.ts` | toggle selection, drawer open/close, builderCards CRUD |
| `chartColors.ts` | Unit | `chartColors.test.ts` | truncateLabel (граничные случаи), formatCount, структура 6 цветовых профилей |
| `ChartCard.tsx` | Component | `ChartCard.test.tsx` | skeleton/children switch, dot-маркер, onTitleClick |
| `KpiTile.tsx` | Component | `KpiTile.test.tsx` | formatCount value, label, onClick, aria-pressed, skeleton, цветная полоса |
| `KpiRow.tsx` | Integration | `KpiRow.integration.test.tsx` | 6 тайлов из store, toggle drawer, aria-pressed sync, spy на openDrawer/closeDrawer |
| `TopCountriesChart.tsx` | Component + Cross-filter | `TopCountriesChart.test.tsx` | skeleton, bar click → setSelection, title click → openDrawer, Cell fills при 3 состояниях selection |
| `ThematicAreasChart.tsx` | Component | `ThematicAreasChart.test.tsx` | empty state, top-15 slice, label truncation, skeleton |

### Что сознательно НЕ тестируется и почему

| Исключение | Причина |
|---|---|
| SVG-рендеринг Recharts (оси, gridlines, анимации) | Ответственность библиотеки; jsdom не имеет layout engine |
| `OpenAccessChart.tsx` (PieChart) | Donut-рендер полностью делегирован Recharts; OA/Closed split — тривиальная арифметика, не требует отдельного теста |
| `PublicationsByYearChart.tsx` | Нет cross-filter (pinned chart); AreaChart/Area — Recharts internals |
| `DocumentTypesChart.tsx` | Паттерн идентичен TopCountriesChart, уже покрытому тестом |
| Hover-анимации, transition-styles | CSS; не выражены в ARIA/DOM |

### Результат (после Phase 1–2)

```
Test Files: 21 passed
Tests:     252 passed  (181 → 252, +71 новый тест)
```

Новые тесты: 18 (dashboardStore) + 14 (chartColors) + 7 (ChartCard) + 7 (KpiTile) + 15 (KpiRow integration) + 9 (TopCountriesChart) + 6 (ThematicAreasChart) = **71 тест**.

### Результат (после Phase 3, 5, 6)

```
Test Files: 23 passed
Tests:     270 passed  (252 → 270, +18 новых тестов)
```

Новые тесты: 9 (DynamicChart) + 9 (ChartBuilderPanel) = **18 тестов**.
dashboardStore: обновлены 2 теста под новую сигнатуру `addBuilderCard(Omit<BuilderCard, 'id'>)`.

---

## 10. Backend: изменения для V1

**Не требуются.** Все данные уже доступны в `GET /articles/stats`.

Для **V2 cross-filtering** потребуется:
- Новый query parameter: `GET /articles/stats?countries[]=China&doc_types[]=Article`
- Фильтрация в `postgres_catalog_repo.get_stats()` по переданным параметрам
- Это — отдельный бэкенд тикет, не входит в scope V1.

---

## 10. Фазированная реализация

### Фаза 1 — Foundation (приоритет 1) ✅ ВЫПОЛНЕНА
- [x] `dashboardStore.ts` — activeSelection, drawer, builderCards
- [x] `chartColors.ts` — расширить 6 цветовых профилей + truncateLabel
- [x] `ChartCard.tsx` — единая оболочка карточки
- [x] `ChartTooltip.tsx` — единый tooltip
- [x] `KpiTile.tsx` + `KpiRow.tsx` — 6 кликабельных тайлов
- [x] Тесты: dashboardStore (18), chartColors (14), ChartCard (7), KpiTile (7), KpiRow (15)

### Фаза 2 — Core charts (приоритет 1) ✅ ВЫПОЛНЕНА
- [x] `PublicationsByYearChart.tsx` — Recharts AreaChart с gradient fill
- [x] `TopCountriesChart.tsx` — Recharts BarChart horizontal + cross-filter
- [x] `DocumentTypesChart.tsx` — Recharts BarChart horizontal + cross-filter
- [x] `TopJournalsChart.tsx` — Recharts BarChart horizontal + cross-filter (заменяет Tremor)
- [x] `OpenAccessChart.tsx` — Recharts PieChart donut (новый компонент)
- [x] `ThematicAreasChart.tsx` — Recharts BarChart horizontal (новый компонент)
- [x] Recharts добавлен как прямая зависимость (`^2.15.4`)
- [x] Тесты: TopCountriesChart (9), ThematicAreasChart (6)

### Фаза 3 — Drawer (приоритет 2) ✅ ВЫПОЛНЕНА
- [x] `DimensionDrawer.tsx` — Sheet + детальный вид (DrawerBarChart / DrawerAreaChart / DrawerOAChart + DrawerTable)
- [x] Интеграция с KpiTile onClick (через dashboardStore.openDrawer)

### Фаза 4 — V1 Cross-filter (приоритет 2) ✅ ВЫПОЛНЕНА
- [x] Все grid-чарты читают `activeSelection` и диммируют/подсвечивают элементы через Cell fill
- [x] Клик по элементу чарта → setSelection / clearSelection

### Фаза 5 — Chart Builder (приоритет 3) ✅ ВЫПОЛНЕНА
- [x] `ChartBuilderPanel.tsx` — accordion, 6 измерений × разрешённые типы, авто-выбор типа при смене измерения
- [x] `DynamicChart.tsx` — bar_h / bar_v / pie / line / table; данные из statsStore; кнопка удаления ×
- [x] ChartCard: добавлен `headerAction` prop
- [x] dashboardStore: `addBuilderCard` принимает `Omit<BuilderCard, 'id'>`, id = `crypto.randomUUID()`
- [x] Интеграция в `ExplorePage.tsx` (после ThematicAreasChart)
- [x] Тесты: DynamicChart (9), ChartBuilderPanel (9)

### Фаза 6 — ExplorePage rewrite (сквозная) ✅ ВЫПОЛНЕНА
- [x] Переписать `ExplorePage.tsx` под новую компоновку (KpiRow → Drawer → Year → 2×2 grid → Thematic → Builder)
- [x] Убрать `@tremor/react` и все Tremor-импорты из chart-компонентов (commit `b165ce5`)
- [x] Тесты мокают `recharts`; ни одной ссылки на `@tremor` в `src/` не осталось

---

## 12. Статус выполнения

**Смёрджено в `main`:** 2026-06-27, PR #29.

| Коммит | Содержание |
|---|---|
| `aaa23a8` | Phase 1 — dashboardStore, chartColors, ChartCard, ChartTooltip, KpiTile, KpiRow |
| `b42e10f` | Phase 2 — 6 chart-компонентов на Recharts + 71 тест |
| `9f619b6` | Phase 3+6 — DimensionDrawer + ExplorePage полностью переписан |
| `dd1f56c` | Phase 5 — ChartBuilderPanel + DynamicChart |
| `1c75e9c` | fix — 4 CI-ошибки после Phase 5 (ESLint, tsc, mock) |
| `b165ce5` | chore — удалить @tremor/react и мёртвые файлы |

**Итог:** 181 → 270 тестов (+89). `@tremor/react` удалён полностью.

**Вне scope V1 (остаётся на будущее):**
- Cross-filter V2: серверная фильтрация `GET /articles/stats?countries[]=...`
- Сохранение `builderCards` в localStorage между сессиями
- Bottom-sheet для DimensionDrawer на мобильных (`< md`)

---

## 13. Post-production: `feat/explore-polish`

**Ветка:** `feat/explore-polish` · создана от `main` 2026-06-27  
**Scope:** UX-полировка + замена нерабочего графика + persistence  
**CI:** `tests.yml`, `frontend-tests.yml`, `e2e.yml` — триггер `push → feat/explore-polish` (заменяет устаревший `interactive-charts`)

---

### П-1. Замена ThematicAreasChart → TopAuthorsChart

**Проблема.** Поле `top_keywords` в `StatsResponse` содержит категории сидера (`seeder_migration` и т.п.) — искусственный артефакт этапов разработки, не имеющий аналитической ценности. Отображение этих данных вводит пользователя в заблуждение.

**Решение — полное замещение новым измерением `author`:**

*Бэкенд (`app/`):*
- `StatsResponse` (`app/schemas/article_schemas.py`): добавить `top_authors: List[CountByField]` и `total_authors: int`
- `PostgresCatalogRepository.get_stats()`: добавить `total_authors` в итоговый `SELECT` (одна строка: `func.count(catalog_articles_q.c.author.distinct())`); добавить запрос `top_authors` по `catalog_articles_q.c.author` (TOP-20, аналогично `by_country`)
- `CatalogService.get_stats()`: проксировать новые поля в `StatsResponse(...)`
- `ICatalogRepository.get_stats()`: синхронизировать возвращаемый тип (аннотация `-> dict`)

*Фронтенд (`frontend/src/`):*
- `types/api.ts`: добавить `top_authors: LabelCount[]` и `total_authors: number` в `StatsResponse`
- `components/charts/chartColors.ts`: тип `Dimension` → убрать `'thematic'`, добавить `'author'`; убрать `thematic` из `DIMENSION_COLORS`, добавить `author` (цвет: `sky-600` = `#0284c7`, hover `#0369a1`, selected `#0369a1`, dimmed `#bae6fd`)
- `components/explore/KpiRow.tsx`: 6-й тайл «Thematic Areas» → «Top Authors» (использует `stats.total_authors`)
- `components/explore/DimensionDrawer.tsx`: убрать `case 'thematic'`, добавить `case 'author'` (HorizontalBar + таблица; `labelMaxLen=24`, `yAxisWidth=140`)
- `components/charts/ThematicAreasChart.tsx`: **удалить**
- `components/charts/TopAuthorsChart.tsx`: **новый компонент** (HorizontalBar, `top-15`, sky-цвет, click→`setSelection('author', value)`, title click→`openDrawer('author')`) — идентичный паттерн с `TopCountriesChart.tsx`
- `pages/ExplorePage.tsx`: убрать `ThematicAreasChart`, добавить `TopAuthorsChart` (та же позиция — full-width под 2×2 grid)

*Аналитическая ценность:* для Scopus (инструмент академической аналитики) распределение по авторам — ключевая метрика; Dimensions.ai и Lens.org аналогично показывают Top Authors.

---

### П-2. Сохранение `builderCards` в localStorage

**Решение:** Zustand `persist` middleware (уже в зависимостях, не новая зависимость).

```typescript
// dashboardStore.ts — обернуть create() в persist()
import { persist, createJSONStorage } from 'zustand/middleware';

export const useDashboardStore = create<DashboardStore>()(
  persist(
    (set, get) => ({ /* impl без изменений */ }),
    {
      name: 'scopus-dashboard-v1',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ builderCards: state.builderCards }),
      version: 1,
      migrate: (_persisted, version) => {
        if (version < 1) return { builderCards: [] };
        return _persisted as DashboardStore;
      },
    }
  )
);
```

`activeSelection` и `drawerDimension` **не персистируются** — сессионное состояние; drawer не должен открываться сам при загрузке страницы.

При изменении структуры `BuilderCard` в будущем: инкрементировать `version: 2`, `migrate` возвращает `{ builderCards: [] }`.

---

### П-3. Bottom-sheet для DimensionDrawer на мобильных (`< md`)

**Решение:** новый хук + условный `side` у shadcn `SheetContent`.

*Новый файл `frontend/src/hooks/useMediaQuery.ts`:*
```typescript
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches
  );
  useEffect(() => {
    const mql = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [query]);
  return matches;
}
```

*`DimensionDrawer.tsx`:*
```tsx
const isMobile = useMediaQuery('(max-width: 767px)');
// SheetContent:
side={isMobile ? 'bottom' : 'right'}
className={isMobile
  ? 'h-[85dvh] w-full flex flex-col p-0 gap-0 rounded-t-xl overflow-hidden'
  : 'sm:max-w-2xl w-full flex flex-col overflow-y-auto p-0 gap-0'
}
```

Drag-handle indicator (мобильный вид):
```tsx
{isMobile && (
  <div className="flex-shrink-0 w-10 h-1 rounded-full bg-slate-300 mx-auto mt-3 mb-0" />
)}
```

Chart height cap на мобильных: `height={isMobile ? Math.min(config.chartHeight, 280) : config.chartHeight}` — предотвращает overflow в `85dvh`.  
`dvh` (dynamic viewport height) корректно учитывает browser UI на мобильных Chrome/Safari (поддержка с 2022).

---

### П-4. Тестовое покрытие

Минимально необходимое — только для поведения, которое молча сломается без теста:

| Файл | Новых тестов | Что проверяется |
|---|---|---|
| `dashboardStore.test.ts` | +2 | persist инициализирует из localStorage; `partialize` не сохраняет `activeSelection` |
| `hooks/useMediaQuery.test.ts` | +3 | matches при query=true; no-match при query=false; listener cleanup при unmount |
| `TopAuthorsChart.test.tsx` | +6 | skeleton, top-15 slice, bar click → `setSelection('author', val)`, title click → `openDrawer('author')` |
| `ThematicAreasChart.test.tsx` | −6 | файл **удаляется** вместе с компонентом |

**Итог тестов после merge:** 270 − 6 (удалено) + 11 (добавлено) = **275 тестов**.

---

## 14. Post-production: Cross-filter V2 — стратегия реализации

**Ветка:** `feat/stats-crossfilter-v2` · создавать после merge `feat/explore-polish`  
**Scope:** backend query params + frontend filtered fetch + active filter UI  
**CI-маркер:** бэкенд-тесты для filtered stats — `requires_pg` (SQLite не поддерживает `func.lower().in_()` корректно при кросс-платформенной коллации)

---

### V2-А. Backend

**Принцип:** переиспользовать существующий `_apply_filters()` в `get_stats()` — логика уже написана.

*`ICatalogRepository.get_stats()`:* расширить сигнатуру:
```python
async def get_stats(
    self,
    countries: list[str] | None = None,
    doc_types: list[str] | None = None,
    open_access: bool | None = None,
    year_from: int | None = None,
    year_to: int | None = None,
) -> dict: ...
```

*`PostgresCatalogRepository.get_stats()`:* вместо CTE → JOIN + `_apply_filters`:
```python
stmt = select(Article).join(CatalogArticle, CatalogArticle.article_id == Article.id)
stmt = self._apply_filters(stmt, keyword=None, search=None,
                           year_from=year_from, year_to=year_to,
                           doc_types=doc_types, open_access=open_access,
                           countries=countries)
catalog_articles_q = stmt.subquery()
# top_authors по filtered subquery — аналогично by_country
```

*FastAPI route `GET /articles/stats`:*
```python
countries: list[str] | None = Query(None)
doc_types: list[str] | None = Query(None)
open_access: bool | None = Query(None)
year_from: int | None = Query(None)
year_to: int | None = Query(None)
```

`StatsResponse` схема **не меняется** — формат ответа одинаков. Глобальный запрос = запрос с пустыми фильтрами.

*Тесты (все `requires_pg`):* `test_stats_filtered_country`, `test_stats_filtered_doc_type`, `test_stats_unfiltered_unchanged`.

---

### V2-Б. Frontend

**Архитектура:** расширить `dashboardStore`, не `statsStore` — сохраняем SRP.

```typescript
// Новые поля в DashboardStore
filteredStats: StatsResponse | null;
filteredStatsLoading: boolean;
fetchFilteredStats: (selection: ActiveSelection) => Promise<void>;
clearFilteredStats: () => void;
```

*`ExplorePage.tsx`:*
```typescript
useEffect(() => {
  if (!activeSelection) clearFilteredStats();
  else fetchFilteredStats(activeSelection);    // AbortController внутри
}, [activeSelection]);
```

*Chart-компоненты:* принимают `stats = filteredStats ?? globalStats` — fallback при загрузке.

*`fetchFilteredStats` (`api/stats.ts`):*
```typescript
export function getFilteredStats(selection: ActiveSelection): Promise<StatsResponse> {
  const params = selectionToParams(selection);  // { countries: [val] } | { doc_types: [val] } | ...
  return client.get('/articles/stats', { params }).then(r => r.data);
}
```

---

### V2-В. Active filter indicator (обязательный UX-элемент)

Полоса между `KpiRow` и `PublicationsByYearChart` — появляется только при активном `activeSelection`:

```
┌──────────────────────────────────────────────────────────┐
│ ⬤ Filtered by: Countries → China    [× Clear filter]     │
│   Showing 4,821 of 39,850 articles                       │
└──────────────────────────────────────────────────────────┘
```

Цвет точки `⬤` = `DIMENSION_COLORS[activeSelection.dimension].base`.  
`[× Clear filter]` → `clearSelection()` + `clearFilteredStats()`.

Без этого индикатора пользователь не поймёт, почему все графики изменились.

---

### V2-Г. Риски и митигации

| Риск | Оценка | Митигация |
|---|---|---|
| Filtered `get_stats()` — 5 SQL-запросов на каждый клик | Средний | Проверить `EXPLAIN ANALYZE` на production Supabase; индексы по `affiliation_country`, `document_type` |
| Race condition при быстрых кликах | Низкий | `AbortController` в `fetchFilteredStats`; хранить ref на предыдущий контроллер |
| `top_authors` при фильтрации по стране → пустой список | Низкий | Fallback: если filtered `top_authors = []` → показывать global |
| V1 visual dimming (Cell fill) + V2 filtered data — коллизия смыслов | Средний | При активном `filteredStats`: отключить dimming, все bars = `colors.base`; dimming актуален только без фильтра |
| SQLite-тесты для filtered path | Да | Все тесты filtered `get_stats()` → `requires_pg`; unit-тест `test_stats_unfiltered` остаётся на SQLite |

---

### V2-Д. Тестовое покрытие

| Файл | Тип | Тест-кейсы |
|---|---|---|
| `tests/integration/test_stats_filtered.py` | `requires_pg` | filtered by country, by doc_type, unfiltered = baseline |
| `dashboardStore.test.ts` | Unit | `fetchFilteredStats` → sets `filteredStats`; `clearFilteredStats` → null; `activeSelection = null` → auto-clear |
| `ActiveFilterBanner.test.tsx` | Component | отображается при selection, скрыт без; кнопка Clear → `clearSelection()` |

**Итог тестов после merge V2:** 275 + ~12 = **≈287 тестов**.

---

## §15. Post-production: оптимизация производительности `GET /articles/stats`

**Дата анализа:** 2026-06-27  
**Контекст:** EXPLAIN ANALYZE на production Supabase после merge PR #31 (Cross-filter V2) выявил,  
что узкое место — не WHERE-фильтрация (функциональные индексы созданы, migration 0014),  
а `COUNT(DISTINCT ...)` агрегация, спилл которой на диск даёт 280–470 ms на filtered path  
и ~3000 ms на unfiltered.

### Baseline (production, ~95k статей в каталоге)

| Запрос | Время | Bottleneck |
|---|---|---|
| Unfiltered | **~3000 ms** | `COUNT(DISTINCT journal/author/country)` → external sort 6.4 MB |
| `country='china'` (36% строк) | **~280 ms** | external sort 2.1 MB + Nested Loop по 34k строкам |
| `doc_type='article'` (72% строк) | **~470 ms** | external sort 4.1 MB + Nested Loop по 69k строкам |

Индексы `ix_articles_lower_affiliation_country` / `ix_articles_lower_document_type` эффективны  
для редких значений (<5% строк). Для топ-значений (China, Article) bottleneck — агрегация, не scan.

---

### П-1. Кэширование ответа `GET /articles/stats` — Upstash Redis

**Цель:** устранить повторные агрегационные запросы. Один и тот же `?countries[]=China`  
от разных пользователей должен возвращаться из кэша, а не пересчитываться (~0 ms vs 280 ms).

**Почему Upstash, а не стандартный Redis:**  
Railway (GCP) блокирует исходящий TCP 6379/6380 — стандартный `redis-py` не работает.  
Upstash Redis использует HTTPS REST API (порт 443) → совместим с Railway.  
Free tier: 10 000 req/day, 256 MB — достаточно для текущей нагрузки.

**Реализация (4 шага):**

1. **Зависимость:** `uv add upstash-redis` → `pyproject.toml`
2. **Клиент:** `app/infrastructure/redis_client.py` — синглтон `Redis(url=..., token=...)`;  
   config-поля `UPSTASH_REDIS_REST_URL: str | None` и `UPSTASH_REDIS_REST_TOKEN: str | None`  
   в `app/config.py`; если не заданы → кэш отключён, запрос идёт напрямую в БД (graceful degradation).
3. **Cache-aside в сервисе:** `CatalogService.get_stats()` — до вызова `catalog_repo.get_stats()`  
   проверить Redis по ключу `stats:{sha256(sorted_params_json)}`, TTL=60 s;  
   промах → вычислить → записать в Redis → вернуть.
4. **Env vars:** `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` — добавить в Railway и `.env`.

**Cache key пример:** `stats:a3f1c8...` где `a3f1c8` = `sha256('{"countries":["china"]}')`.  
**Инвалидация:** TTL=60 s автоматически; после seeder-прогона — явный `DEL stats:*`.

**Тестовое покрытие (П-1-Т, pending):**

| Тест | Файл | Что проверяется |
|------|------|-----------------|
| `test_get_stats_uses_cache_on_hit` | `tests/unit/test_catalog_service.py` | Redis GET → cache hit → `catalog_repo.get_stats()` не вызывается |
| `test_get_stats_writes_cache_on_miss` | `tests/unit/test_catalog_service.py` | Redis GET miss → DB → Redis SETEX с правильным ключом и TTL |
| `test_get_stats_degrades_on_redis_error` | `tests/unit/test_catalog_service.py` | Redis GET бросает исключение → fallback к DB, результат корректен |
| `test_make_stats_cache_key_deterministic` | `tests/unit/test_redis_client.py` | Одни параметры → один ключ; разные параметры → разные ключи; порядок списков не важен |

Моки: `FakeRedis` с управляемым состоянием (hit/miss/error) через `vi.hoisted`-аналог (`AsyncMock`).  
Реальный Upstash в тестах **не используется** — только в-памяти fake-объект.  
CI: тесты SQLite (`not requires_pg`), блокер PR при открытии.

---

### П-2. Увеличение `work_mem` в Supabase

**Цель:** устранить disk spill при `COUNT(DISTINCT ...)` sort. Сейчас 2–6 MB уходит на диск  
при каждом stats-запросе — именно это даёт основную latency.

**Подводные камни:**

1. **Supabase не предоставляет UI для `work_mem`** — только SQL или запрос в поддержку.
2. **Глобальный `work_mem` опасен при конкурентных запросах.** Пример: 10 сессий × 3  
   sort-операции × 32 MB = **960 MB пиковой RAM**. На Free (Micro, 1 GB) — риск OOM.
3. **Free / Pro Starter Micro (1 GB RAM):** не рекомендуется поднимать выше 16 MB глобально.
4. **Compute Add-on Small (2 GB) / Medium (4 GB):** безопасно 32–64 MB.

**Безопасная реализация — per-query `SET LOCAL` (без ограничений по тиру):**

```python
# app/infrastructure/postgres_catalog_repo.py → get_stats()
async with session.begin():
    await session.execute(text("SET LOCAL work_mem = '32MB'"))
    # ... агрегационные запросы (только эта транзакция получает 32 MB)
```

`SET LOCAL` действует только внутри текущей транзакции, не влияет на параллельные сессии,  
OOM исключён. Изменений в конфигурации Supabase не требует.

**Альтернатива — глобально (только при Compute Add-on Medium+):**
```sql
ALTER DATABASE postgres SET work_mem = '32MB';
```

**Ожидаемый эффект после `SET LOCAL work_mem = '32MB'`:**  
sort → in-memory вместо disk spill → unfiltered ~3000 ms → ~500 ms; country ~280 ms → ~80 ms.

---

### Итоговые рекомендации и очерёдность (реализовано)

| Приоритет | Решение | Трудозатраты | Эффект | Статус |
|---|---|---|---|---|
| 🔴 1 | **П-2** — `SET LOCAL work_mem='32MB'` в `get_stats()` | ~1 ч | Disk spill → in-memory; unfiltered 3s → ~500 ms | ✅ Готово |
| 🟡 2 | **П-1** — Upstash Redis кэш (TTL 60 s) | ~1 день | Повторные запросы 0 ms; нет нагрузки на БД | ✅ Готово |

---

### П-3. Опции для будущего масштабирования (не реализовано)

> **Почему отложено:** П-1 + П-2 покрывают потребности учебного проекта.
> Повторные запросы обслуживаются из Redis (~0 ms), первый запрос — ~500 ms после work_mem.
> П-3A и П-3B актуальны при каталоге >500k статей или высокой конкурентной нагрузке,
> которой в учебном контексте нет. Сложность реализации не оправдана эффектом.

#### П-3A — PostgreSQL Materialized View + pg_cron (unfiltered stats → 1–5 ms)

MV хранит предвычисленные агрегаты; `pg_cron` обновляет каждые 6 часов через
`REFRESH MATERIALIZED VIEW CONCURRENTLY`. Не блокирует читателей. Требует ручного
включения расширения `pg_cron` в Supabase Dashboard. **Не решает filtered stats.**

#### П-3B — Pre-aggregated summary tables (filtered single-dim stats → 1 ms)

Таблицы `agg_stats_by_country`, `agg_stats_by_doc_type`, `agg_stats_by_year`;
refresh в конце каждого seeder-прогона через `INSERT ON CONFLICT UPDATE`.
Жёсткий coupling к сидеру; не поддерживает комбинированные фильтры
(`country AND doc_type`). Альтернатива — JSON cache-table в PG вместо внешнего Redis.

---

## Статус выполнения (PR #32, merged 2026-06-27)

**Ветка:** `feat/functional-indices-lower` → PR #32, merge commit `43ec177`.

**Что реализовано:**
- Миграция 0014: функциональные индексы `lower(affiliation_country)` / `lower(document_type)` (`908fe95`); применена на prod + staging Supabase
- `alembic/env.py`: `include_object` хук — expression-индексы исключены из autogenerate (`e9608be`)
- П-1 Redis кэш: `app/infrastructure/redis_client.py` + cache-aside в `CatalogService.get_stats()` (`39d586a`); TTL=60s, graceful degradation
- П-1-Т: 14 unit-тестов (`FakeRedis`, `make_stats_cache_key`) (`888aa04`)
- П-2: `SET LOCAL work_mem='32MB'` в `postgres_catalog_repo.get_stats()` с dialect-чеком (`a4b09a5`)
- CI: ветка в триггерах, coverage 80%, `.env.example` обновлён (`1321125`)

**Вне scope (отложено):**
- П-3A (MV + pg_cron) и П-3B (pre-agg tables) — нецелесообразны для учебного проекта; оставлены как опции масштабирования в §П-3 выше
