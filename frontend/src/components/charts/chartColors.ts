/**
 * Именованные цветовые константы Tremor v3.
 * Tremor принимает названия цветов в формате Tailwind-строк ("blue", "indigo", ...)
 * или hex/oklch-значения в зависимости от версии.
 */

// Основной цвет одиночных чартов (primary blue)
export const CHART_COLOR_PRIMARY = 'blue' as const;

// Цвет для Open Access (emerald) всегда первый в DonutChart
export const CHART_COLOR_OA = 'emerald' as const;

// Цвет для Closed Access (slate) — второй сегмент donut
export const CHART_COLOR_CLOSED = 'slate' as const;

// Палитра для множественных серий (DocumentTypesChart)
export const CHART_COLORS_MULTI = [
  'blue',
  'cyan',
  'teal',
  'violet',
  'amber',
  'rose',
] as const;

export type TremorColor = typeof CHART_COLORS_MULTI[number];
