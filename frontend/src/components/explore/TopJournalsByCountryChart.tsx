import { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import type { TooltipProps } from 'recharts';
import type { ValueType, NameType } from 'recharts/types/component/DefaultTooltipContent';
import type { Payload } from 'recharts/types/component/DefaultLegendContent';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useStatsStore } from '../../stores/statsStore';
import { useTheme } from '../../hooks/useTheme';
import { ChartCard } from '../charts/ChartCard';
import { AXIS_COLORS, formatAxisTick, formatCount, truncateLabel } from '../charts/chartColors';
import { getCountryColor } from '../../constants/countryColors';
import { getLabelMaps } from '../../constants/labelTranslations';
import { pivotJournalCountryData } from './crossChartData';
import type { JournalCountryCount } from '../../types/api';

// График 3 — Top Journals × Country, вертикальные stacked-бары (docs/explore-cross-analytics/spec.md §6).
// Сегменты — тот же топ-5 стран (+ "Other"), что в CountrySunburstChart — единая
// легенда цветов по всему дашборду (см. spec.md §3.2).

const OTHER_BUCKET_COLOR = '#64748b'; // slate-500 — нейтральный, не путается с реальной страной

function useJournalCountryData() {
  const stats = useStatsStore((s) => s.stats);
  return useMemo(() => stats?.top_journals_by_country ?? [], [stats]);
}

function translateCountry(label: string, lang: string, t: TFunction): string {
  if (label === 'Other') return t('explore.crossCharts.other');
  const maps = getLabelMaps(lang);
  return maps ? maps.country[label] ?? label : label;
}

function JournalCountryTooltip({ active, payload, label }: TooltipProps<ValueType, NameType>) {
  const { t, i18n } = useTranslation();
  if (!active || !payload?.length) return null;
  // "Other" — всегда последней строкой в тултипе, тем же порядком, что и в стеке
  // бара (там она уже нижний, т.е. первый рендерящийся сегмент — см. crossChartData.ts
  // pivotJournalCountryData). Recharts отдаёt payload в порядке стека (снизу вверх),
  // поэтому без явной сортировки "Other" оказывалась бы первой строкой в списке.
  const rows = [...payload]
    .filter((p) => Number(p.value) > 0)
    .sort((a, b) => (a.dataKey === 'Other' ? 1 : 0) - (b.dataKey === 'Other' ? 1 : 0));
  const total = rows.reduce((s, p) => s + (Number(p.value) || 0), 0);

  // На узком мобильном экране тултип с 6 строками (топ-5 стран + Other) на полный
  // размер почти закрывал сам график и вылезал за правый край экрана — на мобильном
  // уменьшаем паддинги/шрифт/max-width (mobile-first Tailwind: базовый класс — узкий
  // вариант, sm: — прежний десктопный размер).
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#152236] px-2 py-1.5 sm:px-3 sm:py-2 shadow-lg text-xs sm:text-sm max-w-[170px] sm:max-w-[260px]">
      <p className="font-medium text-slate-900 dark:text-slate-100 mb-1 sm:mb-1.5 break-words">{label}</p>
      <div className="flex flex-col gap-0.5 sm:gap-1">
        {rows.map((p) => (
          <div key={String(p.dataKey)} className="flex items-center gap-1.5 sm:gap-2">
            <span className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
            <span className="text-slate-500 dark:text-slate-400 flex-1">
              {translateCountry(String(p.dataKey), i18n.language, t)}
            </span>
            <span className="font-semibold tabular-nums text-slate-900 dark:text-slate-100">
              {formatCount(Number(p.value))}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-1 sm:mt-1.5 pt-1 sm:pt-1.5 border-t border-slate-100 dark:border-slate-800 flex justify-between text-[11px] sm:text-xs text-slate-400">
        <span>{t('explore.tableColArticles')}</span>
        <span className="font-medium tabular-nums">{formatCount(total)}</span>
      </div>
    </div>
  );
}

// "Other" — визуально последним элементом легенды (хотя в countryOrder он
// первый — нужен нижним сегментом стека, см. pivotJournalCountryData). Порядок
// Bar/стека не трогаем, переставляем только для отображения в легенде.
function reorderOtherLast(payload: Payload[]): Payload[] {
  const otherIdx = payload.findIndex((p) => p.value === 'Other');
  if (otherIdx === -1) return payload;
  const rest = [...payload.slice(0, otherIdx), ...payload.slice(otherIdx + 1)];
  return [...rest, payload[otherIdx]];
}

function rowWidth(row: Payload[], lang: string, t: TFunction): number {
  return row.reduce((sum, entry) => sum + translateCountry(String(entry.value), lang, t).length, 0);
}

// Верхняя строка — чуть длиннее нижней (визуально устойчивее, чем наоборот):
// делим список пополам, и если нижняя строка получилась длиннее (по сумме длин
// переведённых подписей), переносим из неё один — первый — лейбл в верхнюю.
function splitLegendRows(payload: Payload[], lang: string, t: TFunction): [Payload[], Payload[]] {
  const ordered = reorderOtherLast(payload);
  const mid = Math.ceil(ordered.length / 2);
  let row1 = ordered.slice(0, mid);
  let row2 = ordered.slice(mid);
  if (row2.length > 1 && rowWidth(row2, lang, t) >= rowWidth(row1, lang, t)) {
    row1 = [...row1, row2[0]];
    row2 = row2.slice(1);
  }
  return [row1, row2];
}

// Кастомный контент легенды: раскладывает страны в 2 строки вместо однострочной
// легенды Recharts. Дефолтная <Legend> оборачивает элементы в 2 строки, только
// когда не хватает ширины контейнера — на десктопе все 6 подписей (топ-5 стран +
// Other) помещаются в 1 строку и повисают почти вплотную над самым высоким баром
// (Scientific Reports). Принудительно фиксированные 2 строки держат легенду
// компактной и выше по вертикали.
// Каждая строка — независимый flex-контейнер (а не общая grid-колонка): при
// разной длине названий стран (China vs United Kingdom) общие колонки растягивали
// бы обе строки под самую длинную ячейку в каждой колонке, раздувая расстояние
// между соседними подписями. items-end на внешнем flex-col прижимает обе строки
// к одному правому краю (более узкая строка не растягивается на всю ширину).
function JournalCountryLegend({ payload }: { payload?: Payload[] }) {
  const { t, i18n } = useTranslation();
  const { theme } = useTheme();
  if (!payload?.length) return null;
  const rows = splitLegendRows(payload, i18n.language, t);
  // OTHER_BUCKET_COLOR (slate-500) — контрастный на белом фоне, но на тёмном
  // навигационном #0d1b2a почти сливается; на тёмной теме подпись "Other"
  // (не сам кружок-swatch) берёт axis.tick — тот же светлый slate, что подписи осей.
  return (
    <div className="flex flex-col items-end gap-y-1 text-xs">
      {rows.map((row, i) => (
        <div key={i} className="flex gap-x-2.5">
          {row.map((entry) => (
            <span key={String(entry.value)} className="flex items-center gap-1 whitespace-nowrap">
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: entry.color }}
              />
              <span style={{ color: entry.value === 'Other' && theme === 'dark' ? AXIS_COLORS.dark.tick : entry.color }}>
                {translateCountry(String(entry.value), i18n.language, t)}
              </span>
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

export function TopJournalsByCountryChart() {
  const { t, i18n } = useTranslation();
  const { theme } = useTheme();
  const axis = AXIS_COLORS[theme];
  const data: JournalCountryCount[] = useJournalCountryData();
  const isLoading = useStatsStore((s) => s.stats) === null;

  const { countryOrder, pivoted } = useMemo(() => pivotJournalCountryData(data), [data]);

  return (
    <ChartCard title={t('explore.crossCharts.topJournalsByCountry')} isLoading={isLoading} skeletonHeight="h-96">
      <ResponsiveContainer width="100%" height={420}>
        {/* margin.left=20 (не 0): угловые (-40°) подписи журналов якорятся по
            textAnchor="end" в точке тика и тянутся по диагонали влево-вверх —
            при left=0 первая буква самой левой подписи обрезалась краем SVG. */}
        <BarChart data={pivoted} margin={{ top: 8, right: 8, bottom: 8, left: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={axis.grid} vertical={false} />
          <XAxis
            dataKey="journal"
            tick={{ fontSize: 11, fill: axis.tick }}
            tickLine={false}
            axisLine={false}
            interval={0}
            angle={-40}
            textAnchor="end"
            height={110}
            tickFormatter={(v: string) => truncateLabel(v, 24)}
          />
          <YAxis
            type="number"
            tick={{ fontSize: 12, fill: axis.tickMuted }}
            tickLine={false}
            axisLine={false}
            width={44}
            tickFormatter={(v: number) => formatAxisTick(v, i18n.language)}
          />
          <Tooltip
            content={(p) => <JournalCountryTooltip {...p} />}
            cursor={{ fill: 'rgba(148,163,184,0.1)' }}
            allowEscapeViewBox={{ x: false, y: true }}
          />
          {/* Легенда стран — сверху справа (не под осью X, где она конкурировала бы с
              длинными угловыми подписями журналов), принудительно в 2 строки —
              см. JournalCountryLegend. */}
          <Legend verticalAlign="top" align="right" content={(props) => <JournalCountryLegend payload={props.payload} />} />
          {countryOrder.map((country) => (
            <Bar
              key={country}
              dataKey={country}
              name={country}
              stackId="journal-country"
              fill={country === 'Other' ? OTHER_BUCKET_COLOR : getCountryColor(country, theme)}
              radius={country === countryOrder[countryOrder.length - 1] ? [4, 4, 0, 0] : undefined}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
