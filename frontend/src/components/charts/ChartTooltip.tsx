import type { TooltipProps } from 'recharts';
import type { ValueType, NameType } from 'recharts/types/component/DefaultTooltipContent';
import { useTranslation } from 'react-i18next';
import { DIMENSION_COLORS, formatCount } from './chartColors';
import { getLabelMaps } from '../../constants/labelTranslations';
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
  if (!label) return label;
  const maps = getLabelMaps(lang);
  if (!maps) return label;
  switch (dimension) {
    case 'country':     return maps.country[label] ?? label;
    case 'doc_type':    return maps.doc_type[label] ?? label;
    case 'open_access': return maps.oa[label] ?? label;
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

  // Приоритет цвета: реальная заливка сегмента (кладём её в сами данные —
  // см. DrawerBarChart/DrawerDocTypeChart), иначе — статичный base измерения,
  // иначе — то, что сообщает сам Recharts. Нужен именно этот порядок:
  // после ranked-затухания (этап 8) и качественной палитры doc_type все
  // сегменты одного графика перестали быть одного плоского цвета, поэтому
  // фиксированный dimension.base для точки в тултипе больше не годится —
  // она обязана совпадать с реально закрашенным сегментом/баром под курсором.
  const entryColor = (payload[0]?.payload as { color?: string } | undefined)?.color;
  const accentColor = entryColor ?? (dimension ? DIMENSION_COLORS[dimension].base : payload[0]?.color);
  const rawValue = payload[0]?.value;
  const value = typeof rawValue === 'number' ? rawValue : Number(rawValue);
  // Pie/Donut не передают Cartesian-label — там имя категории приходит через
  // nameKey в payload[0].name, а не в аргументе label (тот остаётся пустым).
  const rawLabel = (label !== undefined && label !== '') ? String(label) : String(payload[0]?.name ?? '');
  const displayLabel = translateTooltipLabel(rawLabel, dimension, i18n.language) || rawLabel;

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
