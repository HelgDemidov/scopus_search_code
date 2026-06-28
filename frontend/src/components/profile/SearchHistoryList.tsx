import { useMemo, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useHistoryStore } from '../../stores/historyStore';
import { Skeleton } from '../ui/skeleton';

// Цветовые классы бейджа по полю results_available
const AVAILABILITY_STYLE: Record<'yes' | 'no', string> = {
  yes: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  no:  'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400',
};

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

  // Reset to page 1 when items list changes (e.g. after refetch)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPage(1);
  }, [items.length]);

  const totalPages = Math.ceil(items.length / PAGE_SIZE);
  const pageItems = useMemo(
    () => items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [items, page],
  );

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
            {pageItems.map((item) => (
              <li
                key={item.id}
                className="flex items-start justify-between gap-3 rounded-lg px-3 py-2 text-sm bg-slate-50 dark:bg-slate-700/40"
              >
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="font-medium text-slate-800 dark:text-slate-200 truncate">
                    {item.query}
                  </span>
                  <span className="text-xs text-slate-400">
                    {formatDate(item.created_at, i18n.language)}
                  </span>
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
              </li>
            ))}
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
