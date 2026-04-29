import { useEffect, useMemo, lazy, Suspense } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useStatsStore } from '../stores/statsStore';
import { useAuthStore } from '../stores/authStore';
import {
  useHistoryStore,
  selectByYear,
  selectByDocType,
  selectByCountry,
  selectByJournal,
} from '../stores/historyStore';
import { Skeleton } from '../components/ui/skeleton';
import { Button } from '../components/ui/button';
import { ErrorBoundary } from '../components/ui/ErrorBoundary';

// Charts are lazy-loaded: Tremor/Recharts do not land in the main ExplorePage chunk
const DocumentTypesChart = lazy(() =>
  import('../components/charts/DocumentTypesChart').then(m => ({ default: m.DocumentTypesChart }))
);
const TopCountriesChart = lazy(() =>
  import('../components/charts/TopCountriesChart').then(m => ({ default: m.TopCountriesChart }))
);
const PublicationsByYearChart = lazy(() =>
  import('../components/charts/PublicationsByYearChart').then(m => ({ default: m.PublicationsByYearChart }))
);
const TopJournalsChart = lazy(() =>
  import('../components/charts/TopJournalsChart').then(m => ({ default: m.TopJournalsChart }))
);

function ChartsSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-64 w-full rounded-xl" />
      ))}
    </div>
  );
}

// Специализированный fallback для чартов: перезагрузка страницы,
// а не setState-сброс — lazy-chunk может быть закеширован в сломанном состоянии
function ChartErrorFallback() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-8 text-center">
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Charts failed to load.
      </p>
      <button
        onClick={() => window.location.reload()}
        className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
      >
        Reload page
      </button>
    </div>
  );
}

function KpiCard({
  label,
  value,
  isLoading,
}: {
  label: string;
  value: number;
  isLoading: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 flex flex-col gap-1">
      {isLoading ? (
        <>
          <Skeleton className="h-7 w-24" />
          <Skeleton className="h-4 w-32 mt-1" />
        </>
      ) : (
        <>
          <p className="text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
            {value.toLocaleString('en-US')}
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
        </>
      )}
    </div>
  );
}

export default function ExplorePage() {
  const { stats, isLoading, fetchStats } = useStatsStore();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [searchParams, setSearchParams] = useSearchParams();

  const historyItems = useHistoryStore((s) => s.items);
  const historyLoading = useHistoryStore((s) => s.isLoading);
  const fetchHistory = useHistoryStore((s) => s.fetchHistory);

  const modeParam = searchParams.get('mode');
  const mode: 'collection' | 'personal' =
    isAuthenticated && modeParam === 'personal' ? 'personal' : 'collection';

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchHistory();
    }
  }, [isAuthenticated, fetchHistory]);

  const personalData = useMemo(() => {
    if (mode !== 'personal') return null;
    return {
      by_year: selectByYear(historyItems),
      by_doc_type: selectByDocType(historyItems),
      by_country: selectByCountry(historyItems),
      by_journal: selectByJournal(historyItems),
    };
  }, [mode, historyItems]);

  // KPI values for the collection
  const totalArticles = stats?.total_articles ?? 0;
  const totalCountries = stats?.total_countries ?? 0;
  const openAccessCount = stats?.open_access_count ?? 0;
  const totalDocTypes = stats?.by_doc_type.length ?? 0;

  // KPI values for personal mode
  const personalTotal = historyItems.length;
  const personalResultSum = historyItems.reduce((acc, it) => acc + (it.result_count ?? 0), 0);
  const personalCountries = personalData?.by_country.length ?? 0;
  const personalDocTypes = personalData?.by_doc_type.length ?? 0;

  function switchMode(next: 'collection' | 'personal') {
    const params = new URLSearchParams(searchParams);
    if (next === 'personal') params.set('mode', 'personal');
    else params.delete('mode');
    setSearchParams(params);
  }

  const showPersonalLoading = mode === 'personal' && historyLoading;
  const showCollectionLoading = mode === 'collection' && isLoading;

  return (
    <div className="mx-auto max-w-screen-xl px-4 py-8 flex flex-col gap-8">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          Analytics
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {mode === 'personal'
            ? 'Aggregated statistics from your search queries.'
            : 'Aggregated statistics for the article collection.'}
        </p>
      </div>

      {/* Mode switcher for authenticated users */}
      {isAuthenticated && (
        <div
          className="flex gap-2"
          role="group"
          aria-label="Analytics mode"
        >
          <Button
            variant={mode === 'collection' ? 'default' : 'outline'}
            size="sm"
            onClick={() => switchMode('collection')}
            aria-pressed={mode === 'collection'}
          >
            Collection
          </Button>
          <Button
            variant={mode === 'personal' ? 'default' : 'outline'}
            size="sm"
            onClick={() => switchMode('personal')}
            aria-pressed={mode === 'personal'}
          >
            My searches
          </Button>
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {mode === 'personal' ? (
          <>
            <KpiCard label="Total searches" value={personalTotal} isLoading={historyLoading} />
            <KpiCard label="Articles found" value={personalResultSum} isLoading={historyLoading} />
            <KpiCard label="Countries" value={personalCountries} isLoading={historyLoading} />
            <KpiCard label="Document types" value={personalDocTypes} isLoading={historyLoading} />
          </>
        ) : (
          <>
            <KpiCard label="Articles indexed" value={totalArticles} isLoading={isLoading} />
            <KpiCard label="Countries" value={totalCountries} isLoading={isLoading} />
            <KpiCard label="Open Access" value={openAccessCount} isLoading={isLoading} />
            <KpiCard label="Document types" value={totalDocTypes} isLoading={isLoading} />
          </>
        )}
      </div>

      {/* Charts — изолированы в ErrorBoundary: падение чарта не роняет всю страницу */}
      <ErrorBoundary fallback={<ChartErrorFallback />}>
        {showCollectionLoading || showPersonalLoading ? (
          <ChartsSkeleton />
        ) : mode === 'personal' && personalData ? (
          <Suspense fallback={<ChartsSkeleton />}>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <PublicationsByYearChart data={personalData.by_year} isLoading={false} />
              <DocumentTypesChart data={personalData.by_doc_type} isLoading={false} />
              <TopCountriesChart data={personalData.by_country} isLoading={false} />
              <TopJournalsChart data={personalData.by_journal} isLoading={false} />
            </div>
          </Suspense>
        ) : mode === 'collection' && stats ? (
          <Suspense fallback={<ChartsSkeleton />}>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <PublicationsByYearChart data={stats.by_year} isLoading={false} />
              <DocumentTypesChart data={stats.by_doc_type} isLoading={false} />
              <TopCountriesChart data={stats.by_country} isLoading={false} />
              <TopJournalsChart data={stats.by_journal} isLoading={false} />
            </div>
          </Suspense>
        ) : null}
      </ErrorBoundary>

      {/* CTA banner for anonymous users */}
      {!isAuthenticated && (
        <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 px-6 py-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <p className="text-sm text-blue-900 dark:text-blue-200">
              You are viewing analytics for the &ldquo;Artificial Intelligence and Neural Network Technologies&rdquo; collection.
              Sign in to see analytics based on your own searches.
            </p>
          </div>
          <Link
            to="/auth"
            className="flex-shrink-0 rounded-md bg-blue-800 hover:bg-blue-900 dark:bg-blue-500 dark:hover:bg-blue-400 text-white text-sm font-medium px-4 py-2 transition-colors"
          >
            Sign in
          </Link>
        </div>
      )}
    </div>
  );
}
