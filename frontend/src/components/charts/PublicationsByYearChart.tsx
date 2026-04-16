import { LineChart } from '@tremor/react';
import { Skeleton } from '../ui/skeleton';
import { CHART_COLOR_PRIMARY } from './chartColors';
import type { StatsItem } from '../../types/api';

interface PublicationsByYearChartProps {
  data: StatsItem[];
  isLoading: boolean;
}

export function PublicationsByYearChart({ data, isLoading }: PublicationsByYearChartProps) {
  return (
    // Обёртка чарта с заголовком
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
        Publications by Year
      </h3>

      {/* Skeleton заглушка по §4.2 */}
      {isLoading ? (
        <Skeleton className="h-48 w-full rounded-lg" />
      ) : (
        <LineChart
          data={data}
          index="label"
          categories={['count']}
          colors={[CHART_COLOR_PRIMARY]}
          showLegend={false}
          showGridLines
          curveType="monotone"
          className="h-48"
        />
      )}
    </div>
  );
}
