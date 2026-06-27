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
  base: string      // заливка бара / основной цвет
  hover: string     // при наведении
  selected: string  // активный элемент selection
  dimmed: string    // диммирование неактивных при выделении
  label: string     // человекочитаемое название
}

export const DIMENSION_COLORS: Record<Dimension, DimensionColors> = {
  year: {
    base:     '#2563eb', // blue-600
    hover:    '#1d4ed8', // blue-700
    selected: '#1d4ed8',
    dimmed:   '#bfdbfe', // blue-200
    label: 'Publications by Year',
  },
  country: {
    base:     '#16a34a', // green-600
    hover:    '#15803d', // green-700
    selected: '#15803d',
    dimmed:   '#bbf7d0', // green-200
    label: 'Countries',
  },
  doc_type: {
    base:     '#7c3aed', // violet-600
    hover:    '#6d28d9', // violet-700
    selected: '#6d28d9',
    dimmed:   '#ddd6fe', // violet-200
    label: 'Document Types',
  },
  journal: {
    base:     '#d97706', // amber-600
    hover:    '#b45309', // amber-700
    selected: '#b45309',
    dimmed:   '#fde68a', // amber-200
    label: 'Top Journals',
  },
  open_access: {
    base:     '#0d9488', // teal-600
    hover:    '#0f766e', // teal-700
    selected: '#0f766e',
    dimmed:   '#99f6e4', // teal-200
    label: 'Open Access',
  },
  author: {
    base:     '#0284c7', // sky-600
    hover:    '#0369a1', // sky-700
    selected: '#0369a1',
    dimmed:   '#bae6fd', // sky-200
    label: 'Top Authors',
  },
};

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

export const CHART_TYPE_LABELS: Record<ChartType, string> = {
  bar_h:  'Horizontal Bar',
  bar_v:  'Vertical Bar',
  pie:    'Pie',
  line:   'Line',
  table:  'Table',
};
