// Централизованная палитра цветов для Tremor v3 чартов (§7.2.5 спека)
//
// Tremor v3 принимает только именованные цвета Tailwind в prop `colors`.
// Кастомные HEX-цвета зарегистрированы в tailwind.config.ts через
// theme.extend.colors; safelist защищает их от purge при prod-сборке.
//
// В компонентах передавать: colors={[CHART_COLOR_PRIMARY]}
// Не передавать HEX напрямую в Tremor — это вызовет сбой стилей.

// ---------------------------------------------------------------------------
// Именованные ключи (должны совпадать с theme.extend.colors в tailwind.config.ts)
// ---------------------------------------------------------------------------

export const CHART_COLORS = [
  'chart-blue',
  'chart-teal',
  'chart-violet',
  'chart-amber',
  'chart-rose',
  'chart-emerald',
] as const;

export type ChartColor = (typeof CHART_COLORS)[number];

// ---------------------------------------------------------------------------
// HEX-значения — только для документации и дизайн-токенов
// Не использовать напрямую в Tremor props
// ---------------------------------------------------------------------------

export const CHART_HEX: Record<ChartColor, string> = {
  'chart-blue':    '#1e40af',  // blue-800
  'chart-teal':    '#0f766e',  // teal-700
  'chart-violet':  '#6d28d9',  // violet-700
  'chart-amber':   '#b45309',  // amber-700
  'chart-rose':    '#be123c',  // rose-700
  'chart-emerald': '#047857',  // emerald-700
};

// ---------------------------------------------------------------------------
// Dark-mode — более светлые оттенки тех же цветов
// Зарегистрировать аналогично в tailwind.config.ts (theme.extend.colors)
// ---------------------------------------------------------------------------

export const CHART_COLORS_DARK = [
  'chart-blue-dark',    // #3b82f6  blue-500
  'chart-teal-dark',    // #14b8a6  teal-500
  'chart-violet-dark',  // #8b5cf6  violet-500
  'chart-amber-dark',   // #f59e0b  amber-500
  'chart-rose-dark',    // #f43f5e  rose-500
  'chart-emerald-dark', // #22c55e  green-500
] as const;

// ---------------------------------------------------------------------------
// Семантические алиасы для конкретных чартов
// ---------------------------------------------------------------------------

// Основной цвет (Publications by Year, Top Countries и др.)
export const CHART_COLOR_PRIMARY   = CHART_COLORS[0];  // chart-blue
// Вторичный цвет (многосерийные чарты)
export const CHART_COLOR_SECONDARY = CHART_COLORS[1];  // chart-teal
// Open Access — зелёный сегмент в DonutChart
export const CHART_COLOR_OA_YES    = CHART_COLORS[5];  // chart-emerald
// Non-OA — нейтральный серый сегмент (встроенный в Tremor)
export const CHART_COLOR_OA_NO     = 'slate'           // нативный Tailwind-цвет
