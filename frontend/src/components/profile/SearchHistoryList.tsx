import { useMemo, useState, useEffect } from 'react';
import { useHistoryStore } from '../../stores/historyStore';
import { Skeleton } from '../ui/skeleton';

// Цветовые классы бейджа по полю results_available
const AVAILABILITY_STYLE: Record<'yes' | 'no', string> = {
  yes: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  no:  'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400',
};

const AVAILABILITY_LABEL: Record<'yes' | 'no', string> = {
  yes: 'Available',
  no:  'No results',
};

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

export function SearchHistoryList() {
  const { items, isLoading, fetchHistory } = useHistoryStore();

  // Pagination state: 10 items per page
  const PAGE_SIZE = 10;
  const [page, setPage] = useState(1);

  // Reset to page 1 when items list changes (e.g. after refetch)
  useEffect(() => {
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
          Search History
        </p>
        <button
          onClick={() => fetchHistory()}
          className="text-xs text-blue-700 dark:text-blue-400 hover:underline"
          aria-label="Refresh search history"
        >
          Refresh
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
          No search history yet
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
                    {formatDate(item.created_at)}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {item.result_count != null && (
                    <span className="text-xs tabular-nums text-slate-500 dark:text-slate-400">
                      {item.result_count.toLocaleString('en-US')} results
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
                      ? AVAILABILITY_LABEL.yes
                      : AVAILABILITY_LABEL.no}
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
                aria-label="Previous page"
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
                aria-label="Next page"
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
