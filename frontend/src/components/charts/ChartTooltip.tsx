import type { TooltipProps } from 'recharts';
import type { ValueType, NameType } from 'recharts/types/component/DefaultTooltipContent';
import { useTranslation } from 'react-i18next';
import { DIMENSION_COLORS, formatCount } from './chartColors';
import {
  COUNTRY_TRANSLATIONS_RU,
  DOC_TYPE_TRANSLATIONS_RU,
  OA_LABELS_RU,
} from '../../constants/labelTranslations';
import type { Dimension } from './chartColors';

interface ChartTooltipProps extends TooltipProps<ValueType, NameType> {
  // Измерение чарта — для цветового маркера в тултипе
  dimension?: Dimension;
  // Переопределение метки (например, «count» → «Articles»)
  valueLabel?: string;
}

// Единый кастомный tooltip для всех Recharts-чартов.
// Использование: <Tooltip content={(p) => <ChartTooltip {...p} dimension="country" />} />
function translateTooltipLabel(label: string | undefined, dimension: Dimension | undefined, lang: string): string | undefined {
  if (!label || lang !== 'ru') return label;
  switch (dimension) {
    case 'country':     return COUNTRY_TRANSLATIONS_RU[label] ?? label;
    case 'doc_type':    return DOC_TYPE_TRANSLATIONS_RU[label] ?? label;
    case 'open_access': return OA_LABELS_RU[label] ?? label;
    default:            return label;
  }
}

export function ChartTooltip({
  active,
  payload,
  label,
  dimension,
  valueLabel,
}: ChartTooltipProps) {
  const { t, i18n } = useTranslation();
  const effectiveLabel = valueLabel ?? t('explore.tableColArticles');
  if (!active || !payload?.length) return null;

  const accentColor = dimension ? DIMENSION_COLORS[dimension].base : payload[0]?.color;
  const rawValue = payload[0]?.value;
  const value = typeof rawValue === 'number' ? rawValue : Number(rawValue);
  const displayLabel = translateTooltipLabel(String(label ?? ''), dimension, i18n.language) || label;

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#152236] px-3 py-2 shadow-lg text-sm">
      {displayLabel && (
        <p className="font-medium text-slate-900 dark:text-slate-100 mb-1 max-w-[220px] break-words">
          {displayLabel}
        </p>
      )}
      <div className="flex items-center gap-2">
        <span
          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: accentColor }}
        />
        <span className="text-slate-500 dark:text-slate-400">{effectiveLabel}:</span>
        <span className="font-semibold text-slate-900 dark:text-slate-100">
          {!isNaN(value) ? formatCount(value) : '—'}
        </span>
      </div>
    </div>
  );
}
