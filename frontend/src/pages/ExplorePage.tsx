import { useEffect, useState, lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import { LocalizedLink } from '../components/layout/LocalizedLink';
import { Trans, useTranslation } from 'react-i18next';
import { useStatsStore } from '../stores/statsStore';
import { useAuthStore } from '../stores/authStore';
import { useDashboardStore } from '../stores/dashboardStore';
import { getPersonalStats, getPersonalActivity, getSearchHistory } from '../api/articles';
import type { SearchStatsResponse, PersonalActivityResponse, SearchHistoryItem } from '../types/api';
import { Skeleton } from '../components/ui/skeleton';
import { Button } from '../components/ui/button';
import { ErrorBoundary } from '../components/ui/ErrorBoundary';
import { KpiRow } from '../components/explore/KpiRow';
import { PersonalKpiRow } from '../components/explore/PersonalKpiRow';
import { DimensionDrawer, PersonalDimensionDrawer } from '../components/explore/DimensionDrawer';
import { ActiveFilterBanner } from '../components/explore/ActiveFilterBanner';
import { useHreflangTags } from '../hooks/useHreflangTags';

// PublicationsByYearChart/DocumentTypesChart/TopCountriesChart/TopJournalsChart
// удалены (docs/explore-personal-redesign/spec.md §1.4) — personal mode теперь
// переиспользует KpiRow/DimensionDrawer вместо отдельного набора старых чартов.
// OpenAccessChart/TopAuthorsChart удалены (docs/explore-cross-analytics/spec.md §1) —
// не рендерились нигде (ни collection, ни personal mode), подтверждённый мёртвый код.
// Их drawer-эквиваленты (DimensionDrawer) продолжают работать без изменений.

// 3 новых кросс-аналитических стационарных графика collection mode (spec.md §4-6) —
// тоже lazy: показывают комбинированные разрезы данных, которых KPI/drawer не дают.
const TopCountriesByYearChart = lazy(() =>
  import('../components/explore/TopCountriesByYearChart').then(m => ({ default: m.TopCountriesByYearChart }))
);
const CountrySunburstChart = lazy(() =>
  import('../components/explore/CountrySunburstChart').then(m => ({ default: m.CountrySunburstChart }))
);
const TopJournalsByCountryChart = lazy(() =>
  import('../components/explore/TopJournalsByCountryChart').then(m => ({ default: m.TopJournalsByCountryChart }))
);
// 4-й фикс-график (docs/explore-table-builder/spec.md §1) — объём×импакт по журналам,
// единственное измерение на 2 метриках, поэтому не часть Table Builder (§3).
const JournalLandscapeScatterChart = lazy(() =>
  import('../components/explore/JournalLandscapeScatterChart').then(m => ({ default: m.JournalLandscapeScatterChart }))
);
// 5-й фикс-график (docs/impact-analytics/spec.md §2) — тот же принцип, что 4-й:
// объём×impact, но по странам, без слайдера (данные из уже загруженного statsStore).
const CountryImpactScatterChart = lazy(() =>
  import('../components/explore/CountryImpactScatterChart').then(m => ({ default: m.CountryImpactScatterChart }))
);
// Table Builder (docs/explore-table-builder/spec.md §3) — заменяет удалённый
// ChartBuilderPanel; тоже lazy, тот же принцип: не в основном чанке ExplorePage.
const TableBuilderPanel = lazy(() =>
  import('../components/explore/TableBuilderPanel').then(m => ({ default: m.TableBuilderPanel }))
);
// Автобиографический раздел personal mode (docs/explore-personal-redesign/spec.md §2.1) —
// тоже lazy, тот же принцип: новый Recharts-чанк не должен попадать в основной ExplorePage.
const PersonalActivityChart = lazy(() =>
  import('../components/explore/PersonalActivityChart').then(m => ({ default: m.PersonalActivityChart }))
);
// Filter fingerprint (docs/explore-personal-redesign/spec.md §2.2) — тоже lazy,
// тот же принцип: не в основном чанке ExplorePage.
const FilterFingerprintStrip = lazy(() =>
  import('../components/explore/FilterFingerprintStrip').then(m => ({ default: m.FilterFingerprintStrip }))
);

// Максимум записей истории, нужных fingerprint (desktop N=15 — см. spec.md §2.2;
// mobile N=8 фронт сам режет из этого же набора, повторный фетч не нужен).
const FINGERPRINT_HISTORY_LIMIT = 15;

// ---------------------------------------------------------------------------
// Skeleton-заглушки
// ---------------------------------------------------------------------------

function CollectionSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      {/* Journal Landscape Scatter — full width, теперь первая позиция */}
      <Skeleton className="h-[440px] w-full rounded-xl" />
      {/* Sunburst + Top Journals by Country — вторая строка, пополам */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Skeleton className="h-[480px] w-full rounded-xl" />
        <Skeleton className="h-[480px] w-full rounded-xl" />
      </div>
    </div>
  );
}

function ChartErrorFallback() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-8 text-center">
      <p className="text-sm text-slate-500 dark:text-slate-400">{t('explore.chartsError')}</p>
      <button
        onClick={() => window.location.reload()}
        className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
      >
        {t('explore.reloadPage')}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ExplorePage
// ---------------------------------------------------------------------------

export default function ExplorePage() {
  const { t } = useTranslation();
  const hreflangTags = useHreflangTags('/explore');
  const { fetchStats } = useStatsStore();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const {
    activeSelection,
    fetchFilteredStats,
    clearFilteredStats,
    closeDrawer,
  } = useDashboardStore();
  const [searchParams, setSearchParams] = useSearchParams();

  const modeParam = searchParams.get('mode');
  const mode: 'collection' | 'personal' =
    isAuthenticated && modeParam === 'personal' ? 'personal' : 'collection';

  // Personal mode: реальная агрегация по найденным статьям, не по фильтрам поиска
  // (docs/personal-search-data/spec.md §2/§4) — заменяет клиентские selectByYear/
  // DocType/Country/Journal из historyStore, которые агрегировали параметры
  // фильтров, а не атрибуты фактически найденных статей.
  const [personalStats, setPersonalStats] = useState<SearchStatsResponse | null>(null);
  const [personalLoading, setPersonalLoading] = useState(false);
  // Автобиографический раздел (docs/explore-personal-redesign/spec.md §2.1) —
  // отдельный эндпоинт/state, фетчится параллельно с personalStats в том же эффекте.
  const [personalActivity, setPersonalActivity] = useState<PersonalActivityResponse | null>(null);
  const [personalActivityLoading, setPersonalActivityLoading] = useState(false);
  // Filter fingerprint (spec.md §2.2) — переиспользует существующий GET /articles/history,
  // без нового backend-эндпоинта.
  const [fingerprintItems, setFingerprintItems] = useState<SearchHistoryItem[]>([]);
  const [fingerprintLoading, setFingerprintLoading] = useState(false);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  // Единственный Sheet-instance (dashboardStore.drawerDimension) используется обоими
  // режимами (docs/explore-personal-redesign/spec.md §1.2 п.5) — при переключении
  // mode закрываем drawer, иначе он может остаться открытым с "залипшим" измерением
  // от предыдущего режима (напр. 'author' из collection недостижим в personal).
  useEffect(() => {
    closeDrawer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Cross-filter V2: при изменении выбора — запрашиваем отфильтрованные статистику
  useEffect(() => {
    if (!activeSelection) clearFilteredStats();
    else fetchFilteredStats(activeSelection);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSelection]);

  useEffect(() => {
    if (mode !== 'personal') return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPersonalLoading(true);
    setPersonalActivityLoading(true);
    setFingerprintLoading(true);
    getPersonalStats()
      .then((data) => { if (!cancelled) setPersonalStats(data); })
      .catch(() => { if (!cancelled) setPersonalStats(null); })
      .finally(() => { if (!cancelled) setPersonalLoading(false); });
    getPersonalActivity()
      .then((data) => { if (!cancelled) setPersonalActivity(data); })
      .catch(() => { if (!cancelled) setPersonalActivity(null); })
      .finally(() => { if (!cancelled) setPersonalActivityLoading(false); });
    getSearchHistory(FINGERPRINT_HISTORY_LIMIT)
      .then((items) => { if (!cancelled) setFingerprintItems(items); })
      .catch(() => { if (!cancelled) setFingerprintItems([]); })
      .finally(() => { if (!cancelled) setFingerprintLoading(false); });
    return () => { cancelled = true; };
  }, [mode]);

  function switchMode(next: 'collection' | 'personal') {
    const params = new URLSearchParams(searchParams);
    if (next === 'personal') params.set('mode', 'personal');
    else params.delete('mode');
    setSearchParams(params);
  }

  return (
    <div className="mx-auto max-w-screen-xl px-4 py-8 flex flex-col gap-8">
      {hreflangTags}

      {/* Заголовок раздела */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          {t('explore.title')}
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {mode === 'personal'
            ? t('explore.subtitlePersonal')
            : t('explore.subtitleCollection')}
        </p>
      </div>

      {/* Переключатель режимов — только для авторизованных */}
      {isAuthenticated && (
        <div className="flex gap-2" role="group" aria-label={t('explore.modeLabel')}>
          <Button
            variant={mode === 'collection' ? 'default' : 'outline'}
            size="sm"
            onClick={() => switchMode('collection')}
            aria-pressed={mode === 'collection'}
          >
            {t('explore.modeCollection')}
          </Button>
          <Button
            variant={mode === 'personal' ? 'default' : 'outline'}
            size="sm"
            onClick={() => switchMode('personal')}
            aria-pressed={mode === 'personal'}
          >
            {t('explore.modePersonal')}
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
                {/* Активный фильтр — появляется между KpiRow и графиками */}
                <ActiveFilterBanner />

                {/* 6 старых стационарных чартов отключены здесь (дублировали KpiRow →
                    DimensionDrawer, см. docs/explore-charts-refactor/spec.md §0–1).
                    На их месте — 3 новых кросс-аналитических графика (spec.md §4-6):
                    комбинированные разрезы, которых KPI/drawer (всегда одномерные) не дают. */}

                {/* Journal Landscape Scatter поднят на первую позицию (было — 4-й график,
                    spec.md §1): единственный по-настоящему авторский визуал проекта
                    (docs/project_context/scopus-feedback-07-03.md §6 — «Scatter с
                    квадрантами — ваш единственный по-настоящему авторский элемент»),
                    Top Countries by Year — типовой line-chart, каких много в любом
                    BI-туториале. Первая позиция = первая секунда внимания рекрутера. */}
                <JournalLandscapeScatterChart />

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <CountrySunburstChart />
                  <TopJournalsByCountryChart />
                </div>

                <TopCountriesByYearChart />

                {/* 5-й, последний график (docs/impact-analytics/spec.md §2) — замыкает
                    ряд стационарных графиков, после Top Countries by Year. */}
                <CountryImpactScatterChart />

                {/* Table Builder — пользовательские pivot-таблицы (spec.md §3) */}
                <TableBuilderPanel />
              </div>
            </Suspense>
          </ErrorBoundary>
        </>
      )}

      {/* ================================================================ */}
      {/* PERSONAL MODE — KPI + Drawer (docs/explore-personal-redesign/spec.md §1) */}
      {/* ================================================================ */}
      {mode === 'personal' && (
        <ErrorBoundary fallback={<ChartErrorFallback />}>
          {!personalLoading && (!personalStats || personalStats.total === 0) ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              <Trans
                i18nKey="explore.emptyPersonal"
                components={{ lnk: <LocalizedLink to="/search" className="underline underline-offset-2 hover:text-slate-700 dark:hover:text-slate-300" /> }}
              />
            </p>
          ) : (
            <>
              <PersonalKpiRow stats={personalStats} isLoading={personalLoading} />
              <PersonalDimensionDrawer stats={personalStats} />
              <Suspense fallback={<Skeleton className="h-80 w-full rounded-xl" />}>
                <PersonalActivityChart data={personalActivity} isLoading={personalActivityLoading} />
              </Suspense>
              <Suspense fallback={<Skeleton className="h-48 w-full rounded-xl" />}>
                <FilterFingerprintStrip items={fingerprintItems} isLoading={fingerprintLoading} />
              </Suspense>
            </>
          )}
        </ErrorBoundary>
      )}

      {/* CTA-баннер для анонимных пользователей */}
      {!isAuthenticated && (
        <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 px-6 py-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <p className="text-sm text-blue-900 dark:text-blue-200">
            {t('explore.anonCta')}
          </p>
          <LocalizedLink
            to="/auth"
            className="flex-shrink-0 rounded-md bg-blue-800 hover:bg-blue-900 dark:bg-blue-500 dark:hover:bg-blue-400 text-white text-sm font-medium px-4 py-2 transition-colors"
          >
            {t('nav.signIn')}
          </LocalizedLink>
        </div>
      )}
    </div>
  );
}
