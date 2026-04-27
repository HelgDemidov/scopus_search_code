import { useRef, useEffect } from 'react';
import { Skeleton } from '../ui/skeleton';
import { ArticleCard } from './ArticleCard';
import { PaginationBar } from './PaginationBar';
import type { PageSize } from './PaginationBar';
import type { ArticleResponse } from '../../types/api';

interface ArticleListProps {
  // Существующие props — без изменений
  articles: ArticleResponse[];
  isLoading: boolean;
  sortBy: 'date' | 'citations';
  onSortChange: (sort: 'date' | 'citations') => void;
  // Новые props пагинации — все обязательны (controlled component, нет разумных defaults)
  page: number;
  size: PageSize;
  total: number;
  appendMode: boolean;
  onPageChange: (p: number) => void;
  onSizeChange: (s: number) => void;
  onToggleMode: () => void;
}

// Скелетон-карточка: повторяет структуру ArticleCard
function ArticleSkeleton() {
  return (
    <div className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3 min-h-[80px] flex flex-col gap-2">
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-3/4" />
      <div className="flex gap-1 mt-auto">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-20" />
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
  // Sentinel-элемент для IntersectionObserver в режиме infinite scroll
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Observer активен только в appendMode; отключается в cleanup при смене deps
  useEffect(() => {
    if (!appendMode) return;
    const el = sentinelRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || isLoading) return;
        const totalPages = Math.ceil(total / size);
        if (page < totalPages) onPageChange(page + 1);
      },
      { threshold: 0.1 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [appendMode, isLoading, page, total, size, onPageChange]);

  return (
    <div className="flex flex-col gap-3">
      {/* Строка сортировки */}
      <div className="flex items-center justify-between gap-2">
        {/* Счётчик статей и переключатель режима пагинации */}
        <div className="flex items-center gap-2">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {total > 0 ? `${total.toLocaleString('ru-RU')} articles` : ''}
            {sortBy === 'citations' && (
              <span className="text-amber-600 dark:text-amber-400 ml-1">
                · sorted within page
              </span>
            )}
          </p>
          {total > 0 && (
            <button
              onClick={onToggleMode}
              className="text-xs text-slate-400 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-300 underline-offset-2 hover:underline transition-colors"
            >
              {appendMode ? 'Pages' : 'Scroll'}
            </button>
          )}
        </div>

        {/* Переключатель сортировки — без изменений */}
        <div className="flex items-center gap-1 text-xs">
          <button
            onClick={() => onSortChange('date')}
            className={`px-2 py-1 rounded transition-colors ${
              sortBy === 'date'
                ? 'bg-blue-800 text-white dark:bg-blue-500'
                : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            By date
          </button>
          <button
            onClick={() => onSortChange('citations')}
            className={`px-2 py-1 rounded transition-colors ${
              sortBy === 'citations'
                ? 'bg-blue-800 text-white dark:bg-blue-500'
                : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            By citations
          </button>
        </div>
      </div>

      {/* Сетка grid-cols-2 по §7.2.6 — без изменений */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {isLoading
          ? // Скелетон-заглушки: 6 карточек
            Array.from({ length: 6 }).map((_, i) => <ArticleSkeleton key={i} />)
          : articles.length > 0
          ? articles.map((article, i) => (
              <ArticleCard key={article.doi ?? `article-${i}`} article={article} />
            ))
          : null}
      </div>

      {/* Пагинация: PaginationBar (numbered) или sentinel (append/infinite scroll) */}
      {!isLoading && articles.length > 0 && (
        appendMode
          ? <div ref={sentinelRef} className="h-6" aria-hidden="true" data-testid="sentinel" />
          : <PaginationBar
              page={page}
              size={size}
              total={total}
              onPageChange={onPageChange}
              onSizeChange={onSizeChange}
            />
      )}

      {/* Empty state: нет статей и не загрузка — без изменений */}
      {!isLoading && articles.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          {/* Пиктограмма пустого состояния */}
          <svg viewBox="0 0 64 64" fill="none" className="w-12 h-12 text-slate-300 dark:text-slate-600" aria-hidden="true">
            <circle cx="28" cy="28" r="18" stroke="currentColor" strokeWidth="3" />
            <line x1="41" y1="41" x2="56" y2="56" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            <line x1="20" y1="28" x2="36" y2="28" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            <line x1="28" y1="20" x2="28" y2="36" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            <line x1="22" y1="22" x2="34" y2="34" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="2 3" />
          </svg>
          <div>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              No articles found.
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
              Try a different keyword.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
