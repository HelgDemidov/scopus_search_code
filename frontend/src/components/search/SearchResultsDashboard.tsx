// Dashboard of aggregates for a user search query.
// Data is received via props — the component is unaware of the store and makes no fetch calls.
// Charts are lazy-loaded following the ExplorePage pattern.

import { lazy, Suspense } from 'react';
import { Skeleton } from '../ui/skeleton';
import type { SearchStatsResponse } from '../../types/api';

// Reuse existing charts: their data: StatsItem[] props are compatible
// with SearchStatsResponse fields (both are LabelCount[])
const PublicationsByYearChart = lazy(() =>
  import('../charts/PublicationsByYearChart').then(m => ({ default: m.PublicationsByYearChart }))
);
const DocumentTypesChart = lazy(() =>
  import('../charts/DocumentTypesChart').then(m => ({ default: m.DocumentTypesChart }))
);
const TopCountriesChart = lazy(() =>
  import('../charts/TopCountriesChart').then(m => ({ default: m.TopCountriesChart }))
);
const TopJournalsChart = lazy(() =>
  import('../charts/TopJournalsChart').then(m => ({ default: m.TopJournalsChart }))
);

// Chart grid skeleton — shown while the Tremor JS chunk is downloading
function ChartsSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-64 w-full rounded-xl" />
      ))}
    </div>
  );
}

interface SearchResultsDashboardProps {
  stats: SearchStatsResponse;
  query: string;
}

export function SearchResultsDashboard({ stats, query }: SearchResultsDashboardProps) {
  return (
    <div className="flex flex-col gap-6 mt-6">
      {/* Dashboard heading + KPI: number of matched articles */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Analytics for «{query}»
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {stats.total.toLocaleString('en-US')} articles matched
          </p>
        </div>
      </div>

      {/* Chart grid: lazy-loaded via Suspense */}
      <Suspense fallback={<ChartsSkeleton />}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <PublicationsByYearChart data={stats.by_year}     isLoading={false} />
          <DocumentTypesChart     data={stats.by_doc_type} isLoading={false} />
          <TopCountriesChart      data={stats.by_country}  isLoading={false} />
          <TopJournalsChart       data={stats.by_journal}  isLoading={false} />
        </div>
      </Suspense>
    </div>
  );
}
