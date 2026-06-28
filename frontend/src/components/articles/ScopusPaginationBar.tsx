/**
 * ScopusPaginationBar — client-side paginator for live Scopus results.
 * NOT to be confused with PaginationBar (server-side pagination GET /articles/).
 *
 * The Scopus API returns max 25 results per request — the full array is already
 * in memory (articleStore.liveResults). This component only controls which
 * slice of the array to display: 10 at a time (up to 3 pages) or all at once.
 *
 * Controlled component: livePage lives in useState of the parent (HomePage),
 * liveSize lives in articleStore.liveSize. Callbacks onPageChange/onSizeChange
 * are passed from outside — the component does not read the store directly.
 *
 * Mounted alongside the live-results block in HomePage,
 * analogous to how PaginationBar is mounted alongside ArticleList.
 */

import { useTranslation } from 'react-i18next';
import { Button } from '../ui/button';

// Display mode options for live results — mirrors articleStore.liveSize
export type LiveSize = 10 | 'all';

export interface ScopusPaginationBarProps {
  livePage: number;                    // current page, 1-based; lives in parent useState
  liveSize: LiveSize;                  // from articleStore.liveSize
  total: number;                       // liveResults.length
  onPageChange: (p: number) => void;   // livePage setter from parent
  onSizeChange: (s: LiveSize) => void; // articleStore.setLiveSize
}

export function ScopusPaginationBar({
  livePage,
  liveSize,
  total,
  onPageChange,
  onSizeChange,
}: ScopusPaginationBarProps) {
  const { t } = useTranslation();

  // If total <= 10 everything fits without pagination — neither pages nor toggle needed
  if (total <= 10) return null;

  // Guard against transient livePage:0 on reset
  const safePage = Math.max(1, livePage);

  // Scopus API returns max 25 results => max ceil(25/10) = 3 pages
  // In 'all' mode — one virtual page, navigation is hidden
  const totalPages = liveSize === 'all' ? 1 : Math.ceil(total / 10);
  const pageNumbers = Array.from({ length: totalPages }, (_, i) => i + 1);

  const hasPrev = safePage > 1;
  const hasNext = safePage < totalPages;

  // Compute range for the status line
  const from = liveSize === 'all' ? 1 : (safePage - 1) * 10 + 1;
  const to   = liveSize === 'all' ? total : Math.min(safePage * 10, total);

  return (
    <nav aria-label="Scopus results navigation" className="mt-4">
      <div className="flex flex-wrap items-center justify-between gap-y-2 gap-x-4">

        {/* Status line: "Showing X-Y of Z" */}
        <span className="text-xs text-slate-500 dark:text-slate-400 select-none">
          {t('pagination.showing', { from, to, total })}
        </span>

        {/* Page buttons — shown only in 10-per-page mode */}
        {liveSize === 10 && (
          <div className="flex items-center gap-1" role="group" aria-label={t('pagination.pages')}>
            <Button
              size="sm"
              variant="outline"
              disabled={!hasPrev}
              onClick={() => onPageChange(safePage - 1)}
              aria-label={t('pagination.prevPage')}
            >
              {t('pagination.prev')}
            </Button>

            {pageNumbers.map((p) => (
              <Button
                key={p}
                size="sm"
                variant={p === safePage ? 'default' : 'outline'}
                aria-current={p === safePage ? 'page' : undefined}
                onClick={() => onPageChange(p)}
              >
                {p}
              </Button>
            ))}

            <Button
              size="sm"
              variant="outline"
              disabled={!hasNext}
              onClick={() => onPageChange(safePage + 1)}
              aria-label={t('pagination.nextPage')}
            >
              {t('pagination.next')}
            </Button>
          </div>
        )}

        {/* Toggle "10 per page / All" */}
        <div className="flex items-center gap-1.5" role="group" aria-label={t('pagination.displayMode')}>
          <span className="text-xs text-slate-500 dark:text-slate-400 mr-1 select-none">
            {t('pagination.show')}
          </span>
          <Button
            size="sm"
            variant={liveSize === 10 ? 'default' : 'outline'}
            onClick={() => onSizeChange(10)}
          >
            {t('pagination.perPageN', { n: 10 })}
          </Button>
          <Button
            size="sm"
            variant={liveSize === 'all' ? 'default' : 'outline'}
            onClick={() => onSizeChange('all')}
          >
            {t('pagination.all', { total })}
          </Button>
        </div>

      </div>
    </nav>
  );
}
