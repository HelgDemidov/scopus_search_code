// Цветовая система для дашборда аналитики.
// Каждое измерение имеет собственный профиль: base, hover, selected, dimmed.
// Hex-значения используются напрямую в Recharts (не Tremor-строки).

// ---------------------------------------------------------------------------
// Dimension type — единственный источник истины для имён измерений
// ---------------------------------------------------------------------------

export type Dimension =
  | 'year'
  | 'country'
  | 'doc_type'
  | 'journal'
  | 'open_access'
  | 'author';

export type ChartType = 'bar_h' | 'bar_v' | 'pie' | 'line' | 'table';

// ---------------------------------------------------------------------------
// Цветовые профили измерений
// ---------------------------------------------------------------------------

export interface DimensionColors {
  base: string       // заливка бара / основной цвет
  hover: string      // при наведении
  selected: string   // активный элемент selection
  dimmed: string     // диммирование неактивных (light mode)
  darkDimmed: string // диммирование неактивных (dark mode)
}

export const DIMENSION_COLORS: Record<Dimension, DimensionColors> = {
  year: {
    base:       '#2563eb', // blue-600
    hover:      '#1d4ed8', // blue-700
    selected:   '#1d4ed8',
    dimmed:     '#bfdbfe', // blue-200
    darkDimmed: '#1e3a8a', // blue-900
  },
  country: {
    base:       '#16a34a', // green-600
    hover:      '#15803d', // green-700
    selected:   '#15803d',
    dimmed:     '#bbf7d0', // green-200
    darkDimmed: '#14532d', // green-900
  },
  doc_type: {
    base:       '#7c3aed', // violet-600
    hover:      '#6d28d9', // violet-700
    selected:   '#6d28d9',
    dimmed:     '#ddd6fe', // violet-200
    darkDimmed: '#4c1d95', // violet-900
  },
  journal: {
    base:       '#d97706', // amber-600
    hover:      '#b45309', // amber-700
    selected:   '#b45309',
    dimmed:     '#fde68a', // amber-200
    darkDimmed: '#78350f', // amber-900
  },
  open_access: {
    base:       '#0d9488', // teal-600
    hover:      '#0f766e', // teal-700
    selected:   '#0f766e',
    dimmed:     '#99f6e4', // teal-200
    darkDimmed: '#134e4a', // teal-900
  },
  author: {
    base:       '#0284c7', // sky-600
    hover:      '#0369a1', // sky-700
    selected:   '#0369a1',
    dimmed:     '#bae6fd', // sky-200
    darkDimmed: '#0c4a6e', // sky-900
  },
};

// ---------------------------------------------------------------------------
// Оси/сетка графиков — theme-aware (см. docs/explore-charts-refactor/spec.md §5).
// Recharts принимает только инлайн fill/stroke — Tailwind dark:-классы на них
// не действуют, поэтому цвет нужно выбирать явно через useTheme() на стороне
// компонента и передавать сюда актуальную тему.
// ---------------------------------------------------------------------------

export interface AxisColorSet {
  tick: string       // подписи основной оси (значения)
  tickMuted: string  // подписи второстепенной оси
  grid: string       // линии CartesianGrid
}

export const AXIS_COLORS: Record<'light' | 'dark', AxisColorSet> = {
  light: { tick: '#64748b', tickMuted: '#94a3b8', grid: '#e2e8f0' },
  dark:  { tick: '#cbd5e1', tickMuted: '#94a3b8', grid: '#334155' },
};

// ---------------------------------------------------------------------------
// Затухание цвета бара по рангу (см. docs/explore-charts-refactor/spec.md §8)
// ---------------------------------------------------------------------------

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '');
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (c: number) => Math.round(c).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// Линейная интерполяция между двумя hex-цветами, t ∈ [0, 1]
function mixHex(a: string, b: string, t: number): string {
  const clamped = Math.max(0, Math.min(1, t));
  const pa = hexToRgb(a);
  const pb = hexToRgb(b);
  return rgbToHex(
    pa.r + (pb.r - pa.r) * clamped,
    pa.g + (pb.g - pa.g) * clamped,
    pa.b + (pb.b - pa.b) * clamped,
  );
}

/**
 * Цвет бара горизонтального ранжированного чарта: верхний ранг (index=0)
 * остаётся насыщенным `base`, нижние ранги плавно смещаются к `dimmed`/
 * `darkDimmed` того же измерения (уже спроектированы как «приглушённая
 * версия того же цвета» под обе темы — новая палитра не нужна).
 * Останавливаемся на 70% пути к target — нижний бар заметно приглушён,
 * но не сливается с фоном.
 */
export function getRankedBarColor(
  dim: Dimension,
  index: number,
  total: number,
  theme: 'light' | 'dark',
): string {
  const colors = DIMENSION_COLORS[dim];
  const target = theme === 'dark' ? colors.darkDimmed : colors.dimmed;
  const t = total <= 1 ? 0 : index / (total - 1);
  return mixHex(colors.base, target, t * 0.7);
}

// ---------------------------------------------------------------------------
// Категориальная палитра для донат-чартов закрытых таксономий (doc_type)
// ---------------------------------------------------------------------------
//
// Ranked-затухание (getRankedBarColor) подходит для горизонтального списка,
// где ранги читаются построчно сверху вниз — соседние оттенки одного цвета
// там легко различимы. В donut'е сегменты образуют смежные дуги одного
// круга: несколько соседних затемнений одного и того же фиолетового
// сливаются в глазах в одно сплошное пятно (эмпирически подтверждено —
// скриншот показал 4 крупных сегмента практически неотличимыми друг от
// друга). Для композиционных диаграмм с несколькими сопоставимыми по массе
// категориями нужен именно набор разных оттенков (qualitative palette), а
// не один цвет с вариацией яркости.
//
// 12 цветов Tailwind-600 (тот же вес/насыщенность, что и DIMENSION_COLORS.base
// по всему сайту — палитра не выбивается из общего дизайн-кода), порядок
// подобран так, чтобы соседние по рангу (значит, и по позиции на круге)
// категории всегда попадали на противоположные участки цветового круга.
// Один и тот же набор используется в обеих темах: 600-шейд Tailwind даёt
// достаточный контраст и на белой/светло-серой, и на тёмно-синей (#152236)
// поверхности карточки — отдельной тёмной версии не требуется.
export const TAXONOMY_PALETTE: readonly string[] = [
  '#7c3aed', // violet-600  — совпадает с акцентом измерения doc_type
  '#d97706', // amber-600
  '#059669', // emerald-600
  '#e11d48', // rose-600
  '#2563eb', // blue-600
  '#ea580c', // orange-600
  '#c026d3', // fuchsia-600
  '#65a30d', // lime-600
  '#0891b2', // cyan-600
  '#4f46e5', // indigo-600
  '#dc2626', // red-600
  '#0284c7', // sky-600
];

// Циклический доступ — на случай если категорий окажется больше длины палитры
export function getTaxonomyColor(index: number): string {
  return TAXONOMY_PALETTE[index % TAXONOMY_PALETTE.length];
}

// ---------------------------------------------------------------------------
// Утилиты
// ---------------------------------------------------------------------------

// Усечение длинных меток для Y-оси горизонтальных баров
export function truncateLabel(s: string, n = 28): string {
  return s.length > n ? s.slice(0, n) + '…' : s;
}

// Форматирование числа с тысячными разделителями
export function formatCount(n: number): string {
  return n.toLocaleString('en-US');
}

// Локале-зависимое форматирование подписей осей: 1000 → "1k" / "1 тыс."
export function formatAxisTick(v: number, lang: string): string {
  if (v >= 1000) {
    return lang === 'ru'
      ? `${(v / 1000).toFixed(0)} тыс.`
      : `${(v / 1000).toFixed(0)}k`;
  }
  return String(v);
}

// ---------------------------------------------------------------------------
// Обратная совместимость — старые Tremor-компоненты (удалить после Phase 2)
// ---------------------------------------------------------------------------

export const CHART_COLOR_PRIMARY = 'blue' as const;
export const CHART_COLOR_OA = 'emerald' as const;
export const CHART_COLOR_CLOSED = 'slate' as const;

export const CHART_COLORS_MULTI = [
  'blue',
  'cyan',
  'teal',
  'violet',
  'amber',
  'rose',
] as const;

export type TremorColor = typeof CHART_COLORS_MULTI[number];
