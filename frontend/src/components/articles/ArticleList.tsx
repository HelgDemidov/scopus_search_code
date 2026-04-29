import { ArticleCard } from './ArticleCard';
import { ArticleFiltersSidebar, ArticleFiltersMobile } from './ArticleFilters';
import { PaginationBar } from './PaginationBar';
import type { PageSize } from './PaginationBar';
import type { ArticleResponse } from '../../types/api';

interface ArticleListProps {
  articles: ArticleResponse[];
  isLoading: boolean;
  sortBy: 'date' | 'citations';
  onSortChange: (s: 'date' | 'citations') => void;
  page: number;
  size: PageSize;
  total: number;
  appendMode: boolean;
  onPageChange: (p: number) => void;
  onSizeChange: (s: PageSize) => void;
  onToggleMode: () => void;
}

// Article card skeleton — mirrors ArticleCard structure
function ArticleCardSkeleton() {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 flex flex-col gap-3 animate-pulse">
      <div className="h-5 w-3/4 rounded bg-slate-200 dark:bg-slate-700" />
      <div className="h-4 w-1/2 rounded bg-slate-100 dark:bg-slate-700/60" />
      <div className="flex gap-2">
        <div className="h-5 w-20 rounded-full bg-slate-100 dark:bg-slate-700/60" />
      </div>
    </div>
  );
}

export function ArticleList({
  articles,
  isLoading,
  sortBy,
  onSortChange,
  page,
  size,
  total,
  appendMode,
  onPageChange,
  onSizeChange,
  onToggleMode,
}: ArticleListProps) {

  // Loading skeleton: 5 cards
  if (isLoading && articles.length === 0) {
    return (
      <div className="flex gap-6">
        <ArticleFiltersSidebar />
        <div className="flex-1 min-w-0 flex flex-col gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <ArticleCardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  // Empty state
  if (!isLoading && articles.length === 0) {
    return (
      <div className="flex gap-6">
        <ArticleFiltersSidebar />
        <div className="flex-1 min-w-0">
          <ArticleFiltersMobile />
          <p className="py-16 text-center text-sm text-slate-400">
            No articles found. Try a different search query.
          </p>
        </div>
      </div>
    );
  }

  // Sort controls + article count header
  const totalPages = Math.ceil(total / size);

  return (
    <div className="flex gap-6">
      <ArticleFiltersSidebar />
      <div className="flex-1 min-w-0 flex flex-col gap-3">

        {/* Top bar: mobile filters + sort controls */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <ArticleFiltersMobile />
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {total.toLocaleString('en-US')} results
            </span>
            {/* Sort by */}
            <div role="group" aria-label="Sort" className="flex rounded-md border border-slate-200 dark:border-slate-700 overflow-hidden">
              <button
                aria-pressed={sortBy === 'date'}
                onClick={() => onSortChange('date')}
                className={
                  'px-3 py-1.5 text-xs font-medium transition-colors ' +
                  (sortBy === 'date'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800')
                }
              >
                By date
              </button>
              <button
                aria-pressed={sortBy === 'citations'}
                onClick={() => onSortChange('citations')}
                className={
                  'px-3 py-1.5 text-xs font-medium transition-colors border-l border-slate-200 dark:border-slate-700 ' +
                  (sortBy === 'citations'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800')
                }
              >
                By citations
              </button>
            </div>
          </div>
        </div>

        {/* Article cards */}
        {articles.map((a) => (
          <ArticleCard key={a.id} article={a} />
        ))}

        {/* Pagination bar */}
        <PaginationBar
          page={page}
          size={size}
          total={total}
          totalPages={totalPages}
          appendMode={appendMode}
          onPageChange={onPageChange}
          onSizeChange={onSizeChange}
          onToggleMode={onToggleMode}
        />
      </div>
    </div>
  );
}
