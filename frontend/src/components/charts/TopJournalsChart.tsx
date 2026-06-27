import { BarChart } from '@tremor/react';
import { Skeleton } from '../ui/skeleton';
import { CHART_COLOR_PRIMARY } from './chartColors';
import type { StatsItem } from '../../types/api';

interface TopJournalsChartProps {
  data: StatsItem[];
  isLoading: boolean;
}

export function TopJournalsChart({ data, isLoading }: TopJournalsChartProps) {
  const MAX_LABEL = 28;

  const top10 = [...data]
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
    .map((item) => ({
      ...item,
      label:
        item.label.length > MAX_LABEL
          ? item.label.slice(0, MAX_LABEL) + '…'
          : item.label,
    }));

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
        Top Journals
      </h3>

      {isLoading ? (
        <Skeleton className="h-80 w-full rounded-lg" />
      ) : (
        <BarChart
          data={top10}
          index="label"
          categories={['count']}
          colors={[CHART_COLOR_PRIMARY]}
          layout="vertical"
          showLegend={false}
          showGridLines
          yAxisWidth={180}
          className="h-80"
        />
      )}
    </div>
  );
}
