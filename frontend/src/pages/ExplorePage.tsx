import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useCountUp } from '../hooks/useCountUp';
import { useStatsStore } from '../stores/statsStore';
import { useAuthStore } from '../stores/authStore';
import { DocTypePieChart } from '../components/charts/DocTypePieChart';
import { CountryBarChart } from '../components/charts/CountryBarChart';
import { YearLineChart } from '../components/charts/YearLineChart';
import { QuartileScatterChart } from '../components/charts/QuartileScatterChart';
import { Skeleton } from '../components/ui/skeleton';

// Одна KPI-карточка с анимацией числа
function KpiCard({
  label,
  value,
  unit,
  isLoading,
}: {
  label: string;
  value: number;
  unit?: string;
  isLoading: boolean;
}) {
  const displayed = useCountUp(isLoading ? 0 : value);

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
            {displayed.toLocaleString()}
            {unit && <span className="ml-1 text-sm font-normal text-slate-500 dark:text-slate-400">{unit}</span>}
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
  const totalArticles = stats?.by_year.reduce((acc, d) => acc + d.count, 0) ?? 0;
  const totalCountries = stats?.by_country.length ?? 0;
  const openAccessCount =
    stats?.by_doc_type.find((d) => d.label.toLowerCase().includes('open'))?.count ?? 0;
  const totalDocTypes = stats?.by_doc_type.length ?? 0;

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

      {/* KPI-карточки: сетка 2×2 на мобайле, 4-колоночная на десктопе */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Articles indexed" value={totalArticles} isLoading={isLoading} />
        <KpiCard label="Countries" value={totalCountries} isLoading={isLoading} />
        <KpiCard label="Open Access" value={openAccessCount} isLoading={isLoading} />
        <KpiCard label="Document types" value={totalDocTypes} isLoading={isLoading} />
      </div>

      {/* Графики: два ряда по два */}
      {isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-64 w-full rounded-xl" />
          ))}
        </div>
      ) : stats ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <YearLineChart data={stats.by_year} />
          <DocTypePieChart data={stats.by_doc_type} />
          <CountryBarChart data={stats.by_country} />
          <QuartileScatterChart data={stats.by_quartile ?? []} />
        </div>
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
