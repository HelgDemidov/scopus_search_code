import { DonutChart, Legend } from '@tremor/react';
import { Skeleton } from '../ui/skeleton';
import { CHART_COLOR_OA, CHART_COLOR_CLOSED } from './chartColors';
import type { StatsItem } from '../../types/api';

interface OpenAccessDonutProps {
  /** Pass the by_doc_type or by_open_access stats array */
  data: StatsItem[];
  isLoading: boolean;
}

export function OpenAccessDonut({ data, isLoading }: OpenAccessDonutProps) {
  // Summarise data into 2 segments: Open Access and Closed
  const oaCount = data
    .filter((d) => d.label.toLowerCase().includes('open'))
    .reduce((s, d) => s + d.count, 0);
  const totalCount = data.reduce((s, d) => s + d.count, 0);
  const closedCount = totalCount - oaCount;

  const donutData = [
    { label: 'Open Access', count: oaCount },
    { label: 'Closed', count: closedCount },
  ];

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
        Open Access vs Closed
      </h3>

      {isLoading ? (
        <Skeleton className="h-48 w-full rounded-lg" />
      ) : (
        <div className="flex flex-col items-center gap-3">
          <DonutChart
            data={donutData}
            index="label"
            category="count"
            colors={[CHART_COLOR_OA, CHART_COLOR_CLOSED]}
            showAnimation
            className="h-36"
          />
          <Legend
            categories={['Open Access', 'Closed']}
            colors={[CHART_COLOR_OA, CHART_COLOR_CLOSED]}
            className="text-xs"
          />
        </div>
      )}
    </div>
  );
}
