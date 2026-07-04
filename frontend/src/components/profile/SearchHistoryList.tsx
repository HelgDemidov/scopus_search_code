import { useMemo, useState, useEffect, lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useHistoryStore } from '../../stores/historyStore';
import { getSearchResults } from '../../api/articles';
import { Skeleton } from '../ui/skeleton';
import type { ArticleResponse } from '../../types/api';

// Lazy: полнодетальный просмотр статей — не должен попасть в основной чанк
// ProfilePage (docs/personal-search-data/spec.md §3)
const SearchResultsList = lazy(() =>
  import('./SearchResultsList').then((m) => ({ default: m.SearchResultsList }))
);

// Цветовые классы бейджа по полю results_available
const AVAILABILITY_STYLE: Record<'yes' | 'no', string> = {
  yes: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  no:  'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400',
};

type ExpandState = { status: 'loading' | 'error' | 'success'; articles?: ArticleResponse[] };

function formatDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

export function SearchHistoryList() {
  const { t, i18n } = useTranslation();
  const { items, isLoading, fetchHistory } = useHistoryStore();

  // Pagination state: 10 items per page
  const PAGE_SIZE = 10;
  const [page, setPage] = useState(1);

  // Expand/collapse: id раскрытой строки + кэш результатов по searchId.
  // fetch строго по клику — ни на монтировании, ни для остальных строк (§3)
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [resultsById, setResultsById] = useState<Record<number, ExpandState>>({});

  // Reset to page 1 when items list changes (e.g. after refetch)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPage(1);
    setExpandedId(null);
  }, [items.length]);

  const totalPages = Math.ceil(items.length / PAGE_SIZE);
  const pageItems = useMemo(
    () => items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [items, page],
  );

  async function handleToggle(itemId: number, resultsAvailable: boolean) {
    if (!resultsAvailable) return; // нечего показывать — статей 0

    if (expandedId === itemId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(itemId);

    if (resultsById[itemId]?.status === 'success') return; // уже загружено, не рефетчим

    setResultsById((prev) => ({ ...prev, [itemId]: { status: 'loading' } }));
    try {
      const data = await getSearchResults(itemId);
      setResultsById((prev) => ({ ...prev, [itemId]: { status: 'success', articles: data.articles } }));
    } catch {
      setResultsById((prev) => ({ ...prev, [itemId]: { status: 'error' } }));
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          {t('profile.history.title')}
        </p>
        <button
          onClick={() => fetchHistory()}
          className="text-xs text-blue-700 dark:text-blue-400 hover:underline"
          aria-label={t('a11y.refreshHistory')}
        >
          {t('profile.history.refresh')}
        </button>
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-6">
          {t('profile.history.empty')}
        </p>
      ) : (
        <>
          <ul className="flex flex-col gap-2">
            {pageItems.map((item) => {
              const isExpanded = expandedId === item.id;
              const resultsRegionId = `history-results-${item.id}`;
              const resultState = resultsById[item.id];

              return (
                <li
                  key={item.id}
                  className="rounded-lg bg-slate-50 dark:bg-slate-700/40 text-sm"
                >
                  <button
                    type="button"
                    onClick={() => handleToggle(item.id, item.results_available)}
                    disabled={!item.results_available}
                    aria-expanded={item.results_available ? isExpanded : undefined}
                    aria-controls={item.results_available ? resultsRegionId : undefined}
                    aria-label={
                      item.results_available
                        ? `${isExpanded ? t('profile.history.hideResults') : t('profile.history.showResults')}: ${item.query}`
                        : undefined
                    }
                    className="w-full flex items-start justify-between gap-3 px-3 py-2 text-left disabled:cursor-default"
                  >
                    <div className="flex items-start gap-1.5 min-w-0">
                      {item.results_available && (
                        isExpanded
                          ? <ChevronDown className="size-4 shrink-0 mt-0.5 text-slate-400" aria-hidden />
                          : <ChevronRight className="size-4 shrink-0 mt-0.5 text-slate-400" aria-hidden />
                      )}
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <span className="font-medium text-slate-800 dark:text-slate-200 truncate">
                          {item.query}
                        </span>
                        <span className="text-xs text-slate-400">
                          {formatDate(item.created_at, i18n.language)}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {item.result_count != null && (
                        <span className="text-xs tabular-nums text-slate-500 dark:text-slate-400">
                          {t('profile.history.resultCount', { count: item.result_count })}
                        </span>
                      )}
                      {/* Бейдж доступности — использует results_available из SearchHistoryItem */}
                      <span
                        className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                          item.results_available
                            ? AVAILABILITY_STYLE.yes
                            : AVAILABILITY_STYLE.no
                        }`}
                      >
                        {item.results_available
                          ? t('profile.history.available')
                          : t('profile.history.noResults')}
                      </span>
                    </div>
                  </button>

                  {isExpanded && (
                    <div id={resultsRegionId} role="region" aria-label={item.query} className="px-3 pb-3">
                      {resultState?.status === 'loading' && (
                        <div className="flex flex-col gap-2">
                          <Skeleton className="h-24 w-full rounded-xl" />
                          <Skeleton className="h-24 w-full rounded-xl" />
                        </div>
                      )}
                      {resultState?.status === 'error' && (
                        <p className="text-xs text-rose-600 dark:text-rose-400">
                          {t('profile.history.resultsError')}
                        </p>
                      )}
                      {resultState?.status === 'success' && (
                        <Suspense fallback={<Skeleton className="h-24 w-full rounded-xl" />}>
                          <SearchResultsList articles={resultState.articles ?? []} />
                        </Suspense>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          {/* Pagination controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-3">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="text-xs text-slate-500 hover:text-slate-800 disabled:opacity-40 dark:text-slate-400 dark:hover:text-slate-200"
                aria-label={t('profile.history.prevPage')}
              >
                &larr;
              </button>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="text-xs text-slate-500 hover:text-slate-800 disabled:opacity-40 dark:text-slate-400 dark:hover:text-slate-200"
                aria-label={t('profile.history.nextPage')}
              >
                &rarr;
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
