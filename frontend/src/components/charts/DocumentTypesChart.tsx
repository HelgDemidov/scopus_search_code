import { BarChart } from '@tremor/react';
import { Skeleton } from '../ui/skeleton';
import { CHART_COLORS_MULTI } from './chartColors';
import type { StatsItem } from '../../types/api';

interface DocumentTypesChartProps {
  data: StatsItem[];
  isLoading: boolean;
}

export function DocumentTypesChart({ data, isLoading }: DocumentTypesChartProps) {
  // Документы сортируем по убыванию перед отображением
  const sorted = [...data].sort((a, b) => b.count - a.count);

  // Tremor принимает colors для каждой category; для одной
  // categories=["count"] берём первый цвет из палитры
  const [primaryColor] = CHART_COLORS_MULTI;

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
        Document Types
      </h3>

      {isLoading ? (
        <Skeleton className="h-48 w-full rounded-lg" />
      ) : (
        <BarChart
          data={sorted}
          index="label"
          categories={['count']}
          colors={[primaryColor]}
          showLegend={false}
          showGridLines
          className="h-48"
        />
      )}
    </div>
  );
}
