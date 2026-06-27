import type { TooltipProps } from 'recharts';
import type { ValueType, NameType } from 'recharts/types/component/DefaultTooltipContent';
import { DIMENSION_COLORS, formatCount } from './chartColors';
import type { Dimension } from './chartColors';

interface ChartTooltipProps extends TooltipProps<ValueType, NameType> {
  // Измерение чарта — для цветового маркера в тултипе
  dimension?: Dimension;
  // Переопределение метки (например, «count» → «Articles»)
  valueLabel?: string;
}

// Единый кастомный tooltip для всех Recharts-чартов.
// Использование: <Tooltip content={(p) => <ChartTooltip {...p} dimension="country" />} />
export function ChartTooltip({
  active,
  payload,
  label,
  dimension,
  valueLabel = 'Articles',
}: ChartTooltipProps) {
  if (!active || !payload?.length) return null;

  const accentColor = dimension ? DIMENSION_COLORS[dimension].base : payload[0]?.color;
  const rawValue = payload[0]?.value;
  const value = typeof rawValue === 'number' ? rawValue : Number(rawValue);

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 shadow-lg text-sm">
      {label && (
        <p className="font-medium text-slate-900 dark:text-slate-100 mb-1 max-w-[220px] break-words">
          {label}
        </p>
      )}
      <div className="flex items-center gap-2">
        <span
          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: accentColor }}
        />
        <span className="text-slate-500 dark:text-slate-400">{valueLabel}:</span>
        <span className="font-semibold text-slate-900 dark:text-slate-100">
          {!isNaN(value) ? formatCount(value) : '—'}
        </span>
      </div>
    </div>
  );
}
