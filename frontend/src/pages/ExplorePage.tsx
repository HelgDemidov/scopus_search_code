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
import { KpiRow } from '../components/explore/KpiRow';
import { DimensionDrawer } from '../components/explore/DimensionDrawer';

// Charts — lazy-loaded: не попадают в основной чанк ExplorePage
const PublicationsByYearChart = lazy(() =>
  import('../components/charts/PublicationsByYearChart').then(m => ({ default: m.PublicationsByYearChart }))
);
const TopCountriesChart = lazy(() =>
  import('../components/charts/TopCountriesChart').then(m => ({ default: m.TopCountriesChart }))
);
const DocumentTypesChart = lazy(() =>
  import('../components/charts/DocumentTypesChart').then(m => ({ default: m.DocumentTypesChart }))
);
const TopJournalsChart = lazy(() =>
  import('../components/charts/TopJournalsChart').then(m => ({ default: m.TopJournalsChart }))
);
const OpenAccessChart = lazy(() =>
  import('../components/charts/OpenAccessChart').then(m => ({ default: m.OpenAccessChart }))
);
const ThematicAreasChart = lazy(() =>
  import('../components/charts/ThematicAreasChart').then(m => ({ default: m.ThematicAreasChart }))
);

// ---------------------------------------------------------------------------
// Skeleton-заглушки
// ---------------------------------------------------------------------------

function CollectionSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-56 w-full rounded-xl" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-72 w-full rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-[360px] w-full rounded-xl" />
    </div>
  );
}

function PersonalSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-64 w-full rounded-xl" />
      ))}
    </div>
  );
}

function ChartErrorFallback() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-8 text-center">
      <p className="text-sm text-slate-500 dark:text-slate-400">Charts failed to load.</p>
      <button
        onClick={() => window.location.reload()}
        className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
      >
        Reload page
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ExplorePage
// ---------------------------------------------------------------------------

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

  useEffect(() => { fetchStats(); }, [fetchStats]);

  useEffect(() => {
    if (isAuthenticated) fetchHistory();
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

  function switchMode(next: 'collection' | 'personal') {
    const params = new URLSearchParams(searchParams);
    if (next === 'personal') params.set('mode', 'personal');
    else params.delete('mode');
    setSearchParams(params);
  }

  return (
    <div className="mx-auto max-w-screen-xl px-4 py-8 flex flex-col gap-8">

      {/* Заголовок раздела */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          Collection Analytics
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {mode === 'personal'
            ? 'Statistics from your own live searches.'
            : 'AI & Neural Network Technologies — DOI-indexed articles only.'}
        </p>
      </div>

      {/* Переключатель режимов — только для авторизованных */}
      {isAuthenticated && (
        <div className="flex gap-2" role="group" aria-label="Analytics mode">
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

      {/* ================================================================ */}
      {/* COLLECTION MODE — новая компоновка                               */}
      {/* ================================================================ */}
      {mode === 'collection' && (
        <>
          {/* 6 кликабельных KPI-тайлов */}
          <KpiRow />

          {/* Drawer для детального просмотра по клику на тайл или заголовок чарта */}
          <DimensionDrawer />

          <ErrorBoundary fallback={<ChartErrorFallback />}>
            <Suspense fallback={<CollectionSkeleton />}>
              <div className="flex flex-col gap-6">
                {/* Pinned: Publications by Year — полная ширина */}
                <PublicationsByYearChart
                  data={stats?.by_year ?? []}
                  isLoading={isLoading}
                />

                {/* 2×2 grid: Countries, Doc Types, Journals, Open Access */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <TopCountriesChart
                    data={stats?.by_country ?? []}
                    isLoading={isLoading}
                  />
                  <DocumentTypesChart
                    data={stats?.by_doc_type ?? []}
                    isLoading={isLoading}
                  />
                  <TopJournalsChart
                    data={stats?.by_journal ?? []}
                    isLoading={isLoading}
                  />
                  <OpenAccessChart
                    totalArticles={stats?.total_articles ?? 0}
                    openAccessCount={stats?.open_access_count ?? 0}
                    isLoading={isLoading}
                  />
                </div>

                {/* Thematic Areas — полная ширина */}
                <ThematicAreasChart
                  data={stats?.top_keywords ?? []}
                  isLoading={isLoading}
                />
              </div>
            </Suspense>
          </ErrorBoundary>
        </>
      )}

      {/* ================================================================ */}
      {/* PERSONAL MODE — существующие чарты                               */}
      {/* ================================================================ */}
      {mode === 'personal' && (
        <ErrorBoundary fallback={<ChartErrorFallback />}>
          {historyLoading ? (
            <PersonalSkeleton />
          ) : personalData ? (
            <Suspense fallback={<PersonalSkeleton />}>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <PublicationsByYearChart data={personalData.by_year} isLoading={false} />
                <DocumentTypesChart data={personalData.by_doc_type} isLoading={false} />
                <TopCountriesChart data={personalData.by_country} isLoading={false} />
                <TopJournalsChart data={personalData.by_journal} isLoading={false} />
              </div>
            </Suspense>
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No search history yet.{' '}
              <Link to="/" className="underline underline-offset-2 hover:text-slate-700 dark:hover:text-slate-300">
                Start searching
              </Link>{' '}
              to see your personal analytics.
            </p>
          )}
        </ErrorBoundary>
      )}

      {/* CTA-баннер для анонимных пользователей */}
      {!isAuthenticated && (
        <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 px-6 py-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <p className="text-sm text-blue-900 dark:text-blue-200">
            Sign in to search Scopus live and see analytics based on your own queries.
          </p>
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
