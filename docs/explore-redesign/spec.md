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

### Фаза 3 — Drawer (приоритет 2)
- [ ] `DimensionDrawer.tsx` — Sheet + детальный вид (таблица + крупный чарт)
- [ ] Интеграция с KpiTile onClick

### Фаза 4 — V1 Cross-filter (приоритет 2)
- [ ] Все grid-чарты читают `activeSelection` и диммируют неактивные элементы
- [ ] Клик по элементу чарта → setSelection / clearSelection

### Фаза 5 — Chart Builder (приоритет 3)
- [ ] `ChartBuilderPanel.tsx` + `DynamicChart.tsx`
- [ ] Интеграция в `ExplorePage.tsx`

### Фаза 6 — ExplorePage rewrite (сквозная)
- [ ] Переписать `ExplorePage.tsx` под новую компоновку
- [ ] Убрать Tremor-импорты из chart-компонентов (оставить только shadcn/ui)
- [ ] Обновить тесты: заменить Tremor-компоненты на Recharts в моках

---

## 11. Открытые вопросы (требуют решения до старта реализации)

| # | Вопрос | Рекомендация |
|---|---|---|
| 1 | Убирать ли `@tremor/react` из `package.json` полностью? | Да, после миграции всех chart-компонентов — снизит бандл |
| 2 | Мобильный breakpoint для drawer (Sheet)? | Sheet переходит в bottom-sheet на `< md` — shadcn/ui поддерживает через `direction` prop |
| 3 | Сохранять ли `builderCards` в localStorage? | Нет, V1 — сессионное состояние |
| 4 | `top_keywords`: переименовать в «Thematic Areas» глобально (включая ответ API)? | Переименование поля API — breaking change; для V1 переименовать только на UI |
| 5 | Минимальная ширина для 6 KPI тайлов в одну строку? | На `< lg` — 3×2 grid; на `< sm` — 2×3 grid |
