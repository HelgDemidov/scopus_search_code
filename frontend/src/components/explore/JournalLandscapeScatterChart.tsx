import { useEffect, useState } from 'react';
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
import { getJournalImpact } from '../../api/stats';
import { useTheme } from '../../hooks/useTheme';
import { ChartCard } from '../charts/ChartCard';
import { AXIS_COLORS, formatCount } from '../charts/chartColors';
import { Slider } from '../ui/slider';
import { computeJournalQuadrants } from './crossChartData';
import type { JournalQuadrant } from './crossChartData';
import type { JournalImpactPoint } from '../../types/api';

// График 4 — Journal Landscape Scatter (docs/explore-table-builder/spec.md §1).
// Единственное измерение (journal) на 2 метриках (объём×импакт) — не комбинация
// 2 категориальных разрезов, как остальные 3 фиксированных графика, поэтому
// не встроен в Table Builder (там ось = категориальное измерение, не метрика).
// Слайдер окна зрелости — отдельный некэшируемый запрос /stats/journal-impact
// при каждой смене, не часть StatsResponse/statsStore.

const MATURITY_MIN_YEAR = 2022;
const MATURITY_MAX_YEAR = 2024;
const MATURITY_DEFAULT_YEAR = 2024;

// Границы слайдера выверены по реальным данным (Supabase MCP, см. spec.md §1.1):
// < 2022 — меньше 30 журналов набирают минимальный N=20 (график выглядел бы пусто);
// > 2024 — свежие когорты (2025: 45% статей с 0 цитирований) искажают сравнение
// не по качеству журнала, а по "свежести" его портфеля в коллекции.

// peripheral — единственный цвет, зависящий от темы: slate-500 контрастен на белом,
// но почти сливается с тёмным фоном #0d1b2a (найдено на визуальном ревью). Остальные
// 3 квадранта — достаточно насыщенные hex, читаются одинаково хорошо в обеих темах.
const QUADRANT_COLORS: Record<'light' | 'dark', Record<JournalQuadrant, string>> = {
  light: {
    flagship: '#16a34a', // green-600 — много статей И высокое цитирование
    hiddenGem: '#2563eb', // blue-600 — мало статей, но высокое цитирование
    volumeFactory: '#d97706', // amber-600 — много статей, низкое цитирование
    peripheral: '#64748b', // slate-500 — мало статей, низкое цитирование
  },
  dark: {
    flagship: '#16a34a',
    hiddenGem: '#2563eb',
    volumeFactory: '#d97706',
    peripheral: '#94a3b8', // slate-400 — светлее, иначе сливается с тёмным фоном
  },
};

const QUADRANTS: JournalQuadrant[] = ['flagship', 'hiddenGem', 'volumeFactory', 'peripheral'];

// Полупрозрачный ореол вокруг каждой точки: radial-градиент от HALO_CORE_OPACITY
// (в центре) до 0 (на краю) — там, где точки одного квадранта скучены, ореолы
// перекрываются и визуально усиливают друг друга (эффект "плотности" кластера
// без реального density-расчёта). HALO_CORE_OPACITY=0.3 — самая яркая зона ореола
// прозрачна на ~70%, как и просили.
const HALO_RADIUS = 13;
const POINT_RADIUS = 4.5;
const HALO_CORE_OPACITY = 0.3;

function ScatterPointShape({ cx, cy, payload, theme }: ScatterPointItem & { theme: 'light' | 'dark' }) {
  if (cx === undefined || cy === undefined || !payload) return null;
  const quadrant = payload.quadrant as JournalQuadrant;
  return (
    <g>
      <circle cx={cx} cy={cy} r={HALO_RADIUS} fill={`url(#journal-halo-${quadrant})`} />
      <circle cx={cx} cy={cy} r={POINT_RADIUS} fill={QUADRANT_COLORS[theme][quadrant]} />
    </g>
  );
}

function useJournalImpactData(maxYear: number) {
  const [data, setData] = useState<JournalImpactPoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsLoading(true);
    getJournalImpact(maxYear, controller.signal)
      .then((res) => {
        if (!controller.signal.aborted) setData(res);
      })
      .catch(() => {
        // AbortError при смене maxYear до завершения предыдущего запроса — ожидаемо, не ошибка
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });
    return () => controller.abort();
  }, [maxYear]);

  return { data, isLoading };
}

function JournalImpactTooltip({ active, payload }: TooltipProps<ValueType, NameType>) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  if (!active || !payload?.length) return null;
  const point = payload[0].payload as ReturnType<typeof computeJournalQuadrants>['points'][number];

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#152236] px-3 py-2 shadow-lg text-sm max-w-[220px]">
      <p className="font-medium text-slate-900 dark:text-slate-100 mb-1.5 break-words">{point.journal}</p>
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
        <div className="flex items-center justify-between gap-2">
          <span className="text-slate-500 dark:text-slate-400">{t('explore.crossCharts.journalImpact.tooltipMedian')}</span>
          <span className="font-semibold tabular-nums text-slate-900 dark:text-slate-100">
            {point.median_citations.toFixed(1)}
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

export function JournalLandscapeScatterChart() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const axis = AXIS_COLORS[theme];
  const [maxYear, setMaxYear] = useState(MATURITY_DEFAULT_YEAR);
  const { data, isLoading } = useJournalImpactData(maxYear);

  const { points, medianCount, medianMean } = computeJournalQuadrants(data);

  return (
    <ChartCard
      title={t('explore.crossCharts.journalImpact.title')}
      isLoading={isLoading && points.length === 0}
      skeletonHeight="h-96"
    >
      <div className="flex flex-col gap-4">
        <ResponsiveContainer width="100%" height={460}>
          <ScatterChart margin={{ top: 8, right: 16, bottom: 28, left: 28 }}>
            <defs>
              {QUADRANTS.map((q) => (
                <radialGradient key={q} id={`journal-halo-${q}`}>
                  <stop offset="0%" stopColor={QUADRANT_COLORS[theme][q]} stopOpacity={HALO_CORE_OPACITY} />
                  <stop offset="100%" stopColor={QUADRANT_COLORS[theme][q]} stopOpacity={0} />
                </radialGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={axis.grid} />
            <XAxis
              type="number"
              dataKey="count"
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
              domain={['auto', 'auto']}
              tick={{ fontSize: 11, fill: axis.tickMuted }}
              tickLine={false}
              axisLine={false}
              width={44}
              allowDataOverflow
              // position="left" (не "insideLeft") — тот же принцип, что у X: подпись
              // снаружи области построения, с тем же offset=8 от тиков, что и у X-оси.
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
            {/* Медианные линии — визуально отделены от CartesianGrid (тот же dasharray
                сливался бы с фоновой сеткой): сплошные, цвет tickMuted, а не grid. */}
            <ReferenceLine x={medianCount} stroke={axis.tickMuted} strokeWidth={1} />
            <ReferenceLine y={medianMean} stroke={axis.tickMuted} strokeWidth={1} />
            <Tooltip content={(p) => <JournalImpactTooltip {...p} />} cursor={{ strokeDasharray: '3 3' }} />
            <Scatter
              data={points}
              isAnimationActive={false}
              shape={(props: unknown) => <ScatterPointShape {...(props as ScatterPointItem)} theme={theme} />}
            />
          </ScatterChart>
        </ResponsiveContainer>

        <div className="px-1">
          <div className="flex items-center justify-between mb-2">
            <span
              id="journal-impact-maturity-caption"
              className="text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              {t('explore.crossCharts.journalImpact.maturityCaption', { year: maxYear })}
            </span>
          </div>
          <Slider
            aria-label={t('explore.crossCharts.journalImpact.maturityLabel')}
            aria-describedby="journal-impact-maturity-caption"
            min={MATURITY_MIN_YEAR}
            max={MATURITY_MAX_YEAR}
            step={1}
            value={[maxYear]}
            onValueChange={(v: number[]) => setMaxYear(v[0])}
          />
          <div className="flex justify-between text-[11px] text-slate-400 mt-3">
            {Array.from(
              { length: MATURITY_MAX_YEAR - MATURITY_MIN_YEAR + 1 },
              (_, i) => MATURITY_MIN_YEAR + i,
            ).map((year) => (
              <span key={year}>{year}</span>
            ))}
          </div>
        </div>
      </div>
    </ChartCard>
  );
}
