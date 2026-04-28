import { BarChart } from '@tremor/react';
import { Skeleton } from '../ui/skeleton';
import { CHART_COLOR_PRIMARY } from './chartColors';
import type { StatsItem } from '../../types/api';

interface TopCountriesChartProps {
  data: StatsItem[];
  isLoading: boolean;
}

export function TopCountriesChart({ data, isLoading }: TopCountriesChartProps) {
  // Top-10 countries by article count
  const top10 = [...data]
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
        Top Countries
      </h3>

      {isLoading ? (
        <Skeleton className="h-48 w-full rounded-lg" />
      ) : (
        <BarChart
          data={top10}
          index="label"
          categories={['count']}
          colors={[CHART_COLOR_PRIMARY]}
          layout="vertical"
          showLegend={false}
          showGridLines
          className="h-48"
        />
      )}
    </div>
  );
}
