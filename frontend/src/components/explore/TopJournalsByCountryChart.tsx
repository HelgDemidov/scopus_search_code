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

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#152236] px-3 py-2 shadow-lg text-sm max-w-[260px]">
      <p className="font-medium text-slate-900 dark:text-slate-100 mb-1.5 break-words">{label}</p>
      <div className="flex flex-col gap-1">
        {rows.map((p) => (
          <div key={String(p.dataKey)} className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
            <span className="text-slate-500 dark:text-slate-400 flex-1">
              {translateCountry(String(p.dataKey), i18n.language, t)}
            </span>
            <span className="font-semibold tabular-nums text-slate-900 dark:text-slate-100">
              {formatCount(Number(p.value))}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-1.5 pt-1.5 border-t border-slate-100 dark:border-slate-800 flex justify-between text-xs text-slate-400">
        <span>{t('explore.tableColArticles')}</span>
        <span className="font-medium tabular-nums">{formatCount(total)}</span>
      </div>
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
        <BarChart data={pivoted} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
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
          <Tooltip content={(p) => <JournalCountryTooltip {...p} />} cursor={{ fill: 'rgba(148,163,184,0.1)' }} />
          {/* Легенда стран — сверху справа (не под осью X, где она конкурировала бы с
              длинными угловыми подписями журналов); Recharts сам резервирует место
              под график, оборачивая элементы в 2 строки при нехватке ширины. */}
          <Legend
            verticalAlign="top"
            align="right"
            formatter={(value: string) => translateCountry(value, i18n.language, t)}
            wrapperStyle={{ fontSize: 12 }}
          />
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
