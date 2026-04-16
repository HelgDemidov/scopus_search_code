import { useEffect, lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { useStatsStore } from '../stores/statsStore';
import { useAuthStore } from '../stores/authStore';
import { Skeleton } from '../components/ui/skeleton';

// Чарты загружаются лениво: Tremor/Recharts не попадают в основной чанк ExplorePage.
// React.lazy() требует default-экспорт, поэтому named exports обёртываются
// через .then(m => ({ default: m.ComponentName }))
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

// Скелетон-заглушка для сетки чартов: показывается пока JS-чанк чартов скачивается
function ChartsSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-64 w-full rounded-xl" />
      ))}
    </div>
  );
}

// Одна KPI-карточка; прямое отображение числа без анимации
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
            {value.toLocaleString()}
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

  // Загружаем статистику при первом монтировании
  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Агрегация KPI-значений из stats
  const totalArticles  = stats?.total_articles    ?? 0;
  const totalCountries = stats?.total_countries   ?? 0;
  const openAccessCount = stats?.open_access_count ?? 0;
  const totalDocTypes  = stats?.by_doc_type.length ?? 0;

  return (
    <div className="mx-auto max-w-screen-xl px-4 py-8 flex flex-col gap-8">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          Explore Research
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Aggregated statistics across the current search dataset.
        </p>
      </div>

      {/* KPI-карточки: загружаются сразу, не зависят от JS-чанка чартов */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Articles indexed" value={totalArticles}  isLoading={isLoading} />
        <KpiCard label="Countries"        value={totalCountries} isLoading={isLoading} />
        <KpiCard label="Open Access"      value={openAccessCount} isLoading={isLoading} />
        <KpiCard label="Document types"   value={totalDocTypes}  isLoading={isLoading} />
      </div>

      {/*
        Графики: два уровня скелетонов.
        1) isLoading=true  → данных еще нет, показываем ChartsSkeleton
        2) isLoading=false и stats != null → данные есть;
           <Suspense> показывает ChartsSkeleton пока JS-чанк чартов скачивается
      */}
      {isLoading ? (
        <ChartsSkeleton />
      ) : stats ? (
        <Suspense fallback={<ChartsSkeleton />}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <PublicationsByYearChart data={stats.by_year}     isLoading={false} />
            <DocumentTypesChart     data={stats.by_doc_type} isLoading={false} />
            <TopCountriesChart      data={stats.by_country}  isLoading={false} />
            <TopJournalsChart       data={stats.by_journal}  isLoading={false} />
          </div>
        </Suspense>
      ) : null}

      {/* CTA-баннер для анонимных */}
      {!isAuthenticated && (
        <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 px-6 py-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-blue-900 dark:text-blue-200">
              Want to search across the full Scopus database?
            </p>
            <p className="text-xs text-blue-700 dark:text-blue-400 mt-0.5">
              Sign in to unlock live article search and full results.
            </p>
          </div>
          <Link
            to="/auth"
            className="flex-shrink-0 rounded-md bg-blue-800 hover:bg-blue-900 dark:bg-blue-500 dark:hover:bg-blue-400 text-white text-sm font-medium px-4 py-2 transition-colors"
          >
            Sign In
          </Link>
        </div>
      )}
    </div>
  );
}
