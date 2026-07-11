import { useMemo } from 'react';
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';
import type { TooltipProps } from 'recharts';
import type { ValueType, NameType } from 'recharts/types/component/DefaultTooltipContent';
import type { ScatterPointItem } from 'recharts/types/cartesian/Scatter';
import { useTranslation } from 'react-i18next';
import { useStatsStore } from '../../stores/statsStore';
import { useTheme } from '../../hooks/useTheme';
import { ChartCard } from '../charts/ChartCard';
import { AXIS_COLORS, formatCount } from '../charts/chartColors';
import { getLabelMaps } from '../../constants/labelTranslations';
import { computeImpactQuadrants, computeLogAxisTicks, padLogDomain } from './crossChartData';
import type { ImpactQuadrant } from './crossChartData';
import type { CountryImpactPoint } from '../../types/api';

// 5-й стационарный график /explore — Country Impact Scatter (docs/impact-analytics/spec.md §2).
// Прямое расширение паттерна Journal Landscape Scatter: объём × avg(cited_by_count),
// но БЕЗ слайдера окна зрелости (данные из уже загруженного statsStore, тот же
// top-20-по-объёму набор, что и по остальным 3 кросс-агрегатам) и БЕЗ median_citations
// (top-N по объёму на ~140k-статейной коллекции убирает риск "выброс с N=1 наверху",
// ради которого медиана нужна на journal-уровне — см. CountryImpactPoint).

// Тот же 4-цветный набор, что Journal Landscape Scatter (chartColors.ts не трогаем —
// это не dataviz-примитив общего назначения, а специфика двух scatter-графиков).
const QUADRANT_COLORS: Record<'light' | 'dark', Record<ImpactQuadrant, string>> = {
  light: {
    flagship: '#16a34a',
    hiddenGem: '#2563eb',
    volumeFactory: '#d97706',
    peripheral: '#64748b',
  },
  dark: {
    flagship: '#16a34a',
    hiddenGem: '#2563eb',
    volumeFactory: '#d97706',
    peripheral: '#94a3b8',
  },
};

const QUADRANTS: ImpactQuadrant[] = ['flagship', 'hiddenGem', 'volumeFactory', 'peripheral'];

const HALO_RADIUS = 13;
const POINT_RADIUS = 4.5;
const HALO_CORE_OPACITY = 0.3;

function ScatterPointShape({ cx, cy, payload, theme }: ScatterPointItem & { theme: 'light' | 'dark' }) {
  if (cx === undefined || cy === undefined || !payload) return null;
  const quadrant = payload.quadrant as ImpactQuadrant;
  return (
    <g>
      <circle cx={cx} cy={cy} r={HALO_RADIUS} fill={`url(#country-impact-halo-${quadrant})`} />
      <circle cx={cx} cy={cy} r={POINT_RADIUS} fill={QUADRANT_COLORS[theme][quadrant]} />
    </g>
  );
}

function CountryImpactTooltip({ active, payload }: TooltipProps<ValueType, NameType>) {
  const { t, i18n } = useTranslation();
  const { theme } = useTheme();
  if (!active || !payload?.length) return null;
  const point = payload[0].payload as ReturnType<typeof computeImpactQuadrants<CountryImpactPoint>>['points'][number];
  const maps = getLabelMaps(i18n.language);
  const countryLabel = maps ? (maps.country[point.country] ?? point.country) : point.country;

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#152236] px-3 py-2 shadow-lg text-sm max-w-[220px]">
      <p className="font-medium text-slate-900 dark:text-slate-100 mb-1.5 break-words">{countryLabel}</p>
      <div className="flex flex-col gap-1 text-xs">
        <div className="flex items-center justify-between gap-2">
          <span className="text-slate-500 dark:text-slate-400">{t('explore.tableColArticles')}</span>
          <span className="font-semibold tabular-nums text-slate-900 dark:text-slate-100">
            {formatCount(point.count)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-slate-500 dark:text-slate-400">{t('explore.crossCharts.journalImpact.tooltipMean')}</span>
          <span className="font-semibold tabular-nums text-slate-900 dark:text-slate-100">
            {point.mean_citations.toFixed(1)}
          </span>
        </div>
      </div>
      <div className="mt-1.5 pt-1.5 border-t border-slate-100 dark:border-slate-800 flex items-center gap-1.5">
        <span
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: QUADRANT_COLORS[theme][point.quadrant] }}
        />
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {t(`explore.crossCharts.journalImpact.quadrants.${point.quadrant}`)}
        </span>
      </div>
    </div>
  );
}

export function CountryImpactScatterChart() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const axis = AXIS_COLORS[theme];
  const stats = useStatsStore((s) => s.stats);
  const isLoading = stats === null;

  const data = useMemo(() => stats?.country_impact ?? [], [stats]);
  const { points, medianCount, medianMean } = useMemo(() => computeImpactQuadrants(data), [data]);

  // Отступ по краям + явные тики на X (docs/impact-analytics/spec.md) — без них
  // Китай (на порядок больше следующей страны) сидит ровно на границе plot area
  // и обрезается в полукруг, а подпись на самом экстремальном тике не гарантирована
  // (см. padLogDomain/computeLogAxisTicks в crossChartData.ts).
  const xValues = useMemo(() => points.map((p) => p.count), [points]);
  const yValues = useMemo(() => points.map((p) => p.plotMean), [points]);
  const xDomain = useMemo<[number, number] | ['auto', 'auto']>(
    () => (xValues.length > 0 ? padLogDomain(Math.min(...xValues), Math.max(...xValues)) : ['auto', 'auto']),
    [xValues],
  );
  const yDomain = useMemo<[number, number] | ['auto', 'auto']>(
    () => (yValues.length > 0 ? padLogDomain(Math.min(...yValues), Math.max(...yValues)) : ['auto', 'auto']),
    [yValues],
  );
  const xTicks = useMemo(() => computeLogAxisTicks(xValues), [xValues]);

  return (
    <ChartCard
      title={t('explore.crossCharts.countryImpact.title')}
      isLoading={isLoading}
      skeletonHeight="h-96"
      translucent
    >
      <ResponsiveContainer width="100%" height={460}>
        <ScatterChart margin={{ top: 8, right: 16, bottom: 28, left: 28 }}>
          <defs>
            {QUADRANTS.map((q) => (
              <radialGradient key={q} id={`country-impact-halo-${q}`}>
                <stop offset="0%" stopColor={QUADRANT_COLORS[theme][q]} stopOpacity={HALO_CORE_OPACITY} />
                <stop offset="100%" stopColor={QUADRANT_COLORS[theme][q]} stopOpacity={0} />
              </radialGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={axis.grid} />
          <XAxis
            type="number"
            dataKey="count"
            // Лог-шкала — тот же приём, что уже на Y (mean_citations), по той же причине:
            // публикации по странам ещё сильнее скошены (Китай на порядок больше следующей
            // страны), линейная шкала сжимала бы весь остальной график в один угол.
            // count всегда > 0 (top-20 стран по объёму) — floor-хак, как у Y/plotMean
            // для mean_citations=0, здесь не нужен.
            scale="log"
            domain={xDomain}
            ticks={xTicks}
            allowDataOverflow
            tick={{ fontSize: 11, fill: axis.tickMuted }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => formatCount(v)}
            label={{
              value: t('explore.crossCharts.journalImpact.xAxisLabel'),
              position: 'bottom',
              offset: 8,
              fill: axis.tickMuted,
              fontSize: 12,
            }}
          />
          <YAxis
            type="number"
            dataKey="plotMean"
            scale="log"
            domain={yDomain}
            allowDataOverflow
            tick={{ fontSize: 11, fill: axis.tickMuted }}
            tickLine={false}
            axisLine={false}
            width={44}
            label={{
              value: t('explore.crossCharts.journalImpact.yAxisLabel'),
              angle: -90,
              position: 'left',
              offset: 8,
              style: { textAnchor: 'middle' },
              fill: axis.tickMuted,
              fontSize: 12,
            }}
          />
          <ReferenceLine x={medianCount} stroke={axis.tickMuted} strokeWidth={1} />
          <ReferenceLine y={medianMean} stroke={axis.tickMuted} strokeWidth={1} />
          <Tooltip content={(p) => <CountryImpactTooltip {...p} />} cursor={{ strokeDasharray: '3 3' }} />
          <Scatter
            data={points}
            isAnimationActive={false}
            shape={(props: unknown) => <ScatterPointShape {...(props as ScatterPointItem)} theme={theme} />}
          />
        </ScatterChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
