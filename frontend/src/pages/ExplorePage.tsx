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

// Чарты загружаются лениво: Tremor/Recharts не попадают в основной чанк ExplorePage.
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
            {value.toLocaleString('ru-RU')}
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

  // KPI значения для коллекции
  const totalArticles = stats?.total_articles ?? 0;
  const totalCountries = stats?.total_countries ?? 0;
  const openAccessCount = stats?.open_access_count ?? 0;
  const totalDocTypes = stats?.by_doc_type.length ?? 0;

  // KPI значения для personal-режима
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
          Аналитика
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {mode === 'personal'
            ? 'Агрегированная статистика по вашим поисковым запросам.'
            : 'Агрегированная статистика по коллекции статей.'}
        </p>
      </div>

      {/* Переключатель режима для авторизованных */}
      {isAuthenticated && (
        <div
          className="flex gap-2"
          role="group"
          aria-label="Режим аналитики"
        >
          <Button
            variant={mode === 'collection' ? 'default' : 'outline'}
            size="sm"
            onClick={() => switchMode('collection')}
            aria-pressed={mode === 'collection'}
          >
            По коллекции
          </Button>
          <Button
            variant={mode === 'personal' ? 'default' : 'outline'}
            size="sm"
            onClick={() => switchMode('personal')}
            aria-pressed={mode === 'personal'}
          >
            По моим поискам
          </Button>
        </div>
      )}

      {/* KPI-карточки */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {mode === 'personal' ? (
          <>
            <KpiCard label="Всего поисков" value={personalTotal} isLoading={historyLoading} />
            <KpiCard label="Найдено статей" value={personalResultSum} isLoading={historyLoading} />
            <KpiCard label="Стран" value={personalCountries} isLoading={historyLoading} />
            <KpiCard label="Типов документов" value={personalDocTypes} isLoading={historyLoading} />
          </>
        ) : (
          <>
            <KpiCard label="Статей в индексе" value={totalArticles} isLoading={isLoading} />
            <KpiCard label="Стран" value={totalCountries} isLoading={isLoading} />
            <KpiCard label="Open Access" value={openAccessCount} isLoading={isLoading} />
            <KpiCard label="Типов документов" value={totalDocTypes} isLoading={isLoading} />
          </>
        )}
      </div>

      {/* Графики */}
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

      {/* CTA-баннер для анонимных */}
      {!isAuthenticated && (
        <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 px-6 py-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <p className="text-sm text-blue-900 dark:text-blue-200">
              Вы просматриваете аналитику по тематической коллекции "Artificial Intelligence and Neural Network Technologies". Авторизуйтесь, чтобы видеть аналитику по своим запросам.
            </p>
          </div>
          <Link
            to="/auth"
            className="flex-shrink-0 rounded-md bg-blue-800 hover:bg-blue-900 dark:bg-blue-500 dark:hover:bg-blue-400 text-white text-sm font-medium px-4 py-2 transition-colors"
          >
            Войти
          </Link>
        </div>
      )}
    </div>
  );
}
