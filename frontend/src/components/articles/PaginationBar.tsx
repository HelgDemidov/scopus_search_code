/**
 * PaginationBar — paginator with size selector for ArticleList / ProfilePage.
 * NOT to be confused with ui/PaginationControls (shadcn wrapper used elsewhere).
 *
 * Mounted alongside ArticleList at the page level (HomePage / ProfilePage),
 * not inside ArticleList — to keep the latter single-responsibility.
 *
 * State management: articleStore.setPage / articleStore.setSize.
 * setSize already resets page:1 + articles:[] inside the store —
 * do NOT duplicate this reset in onSizeChange at the parent level.
 */

import { usePagination } from '../../hooks/usePagination';
import { Button } from '../ui/button';

// Allowed page size options; match the store default (size: 10)
export const SIZE_OPTIONS = [10, 25, 50] as const;
export type PageSize = typeof SIZE_OPTIONS[number]; // 10 | 25 | 50

export interface PaginationBarProps {
  page: number;    // current page, 1-based
  size: PageSize;  // current page size
  total: number;   // total record count (PaginatedArticleResponse.total)
  totalPages: number;
  appendMode: boolean;
  onPageChange: (p: number) => void;
  onSizeChange: (s: PageSize) => void;
  onToggleMode: () => void;
}

export function PaginationBar({
  page,
  size,
  total,
  totalPages,
  onPageChange,
  onSizeChange,
}: PaginationBarProps) {
  // Guard against transient page:0 on rapid filter changes in articleStore
  const safePage = Math.max(1, page);

  const { pages, hasPrev, hasNext } = usePagination(total, safePage, size);

  // Single page (or zero total) — pagination is pointless
  if (totalPages <= 1) return null;

  return (
    <nav aria-label="Page navigation" className="mt-4">
      <div className="flex flex-wrap items-center justify-between gap-y-2 gap-x-4">

        {/* Page buttons: Prev + numbers + Next */}
        <div className="flex items-center gap-1" role="group" aria-label="Pages">
          <Button
            size="sm"
            variant="outline"
            disabled={!hasPrev}
            onClick={() => onPageChange(safePage - 1)}
            aria-label="Previous page"
          >
            ← Prev
          </Button>

          {pages.map((p, i) =>
            p === 'ellipsis' ? (
              // Ellipsis is not clickable — span, not Button
              <span
                key={`ell-${i}`}
                aria-hidden="true"
                className="px-1 text-sm text-slate-400 dark:text-slate-500 select-none"
              >
                …
              </span>
            ) : (
              <Button
                key={p}
                size="sm"
                variant={p === safePage ? 'default' : 'outline'}
                aria-current={p === safePage ? 'page' : undefined}
                onClick={() => onPageChange(p)}
              >
                {p}
              </Button>
            )
          )}

          <Button
            size="sm"
            variant="outline"
            disabled={!hasNext}
            onClick={() => onPageChange(safePage + 1)}
            aria-label="Next page"
          >
            Next →
          </Button>
        </div>

        {/* Page size selector */}
        <div className="flex items-center gap-1.5" role="group" aria-label="Rows per page">
          <span className="text-xs text-slate-500 dark:text-slate-400 mr-1 select-none">
            Per page:
          </span>
          {SIZE_OPTIONS.map((s) => (
            <Button
              key={s}
              size="sm"
              variant={s === size ? 'default' : 'outline'}
              onClick={() => onSizeChange(s)}
            >
              {s}
            </Button>
          ))}
        </div>

      </div>
    </nav>
  );
}
