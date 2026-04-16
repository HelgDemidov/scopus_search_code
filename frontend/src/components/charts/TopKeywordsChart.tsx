import { BarChart } from '@tremor/react';
import { Skeleton } from '../ui/skeleton';
import { CHART_COLOR_PRIMARY } from './chartColors';
import type { StatsItem } from '../../types/api';

interface TopKeywordsChartProps {
  data: StatsItem[];
  isLoading: boolean;
}

export function TopKeywordsChart({ data, isLoading }: TopKeywordsChartProps) {
  // Выбираем top-15 ключевых слов по частоте встречаемости
  const top15 = [...data]
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
        Top Keywords
      </h3>

      {isLoading ? (
        <Skeleton className="h-48 w-full rounded-lg" />
      ) : top15.length === 0 ? (
        // Empty state: ключевые слова часто не возвращаются анонимными запросами
        <div className="flex h-48 items-center justify-center">
          <p className="text-xs text-slate-400 dark:text-slate-500">No keyword data available</p>
        </div>
      ) : (
        <BarChart
          data={top15}
          index="label"
          categories={['count']}
          colors={[CHART_COLOR_PRIMARY]}
          layout="vertical"
          showLegend={false}
          showGridLines
          className="h-56"
        />
      )}
    </div>
  );
}
