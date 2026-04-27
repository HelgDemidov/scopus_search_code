/**
 * PaginationBar — пагинатор с size-selector для ArticleList / ProfilePage.
 * НЕ путать с ui/PaginationControls (shadcn-wrapper для других мест).
 *
 * Монтируется рядом с ArticleList на уровне страницы (HomePage / ProfilePage),
 * а не внутри ArticleList — чтобы не нарушать SRP последнего.
 *
 * Управление состоянием: articleStore.setPage / articleStore.setSize.
 * setSize уже делает page:1 + articles:[] внутри стора —
 * не дублируй этот сброс в onSizeChange на уровне родителя.
 */

import { usePagination } from '../../hooks/usePagination';
import { Button } from '../ui/button';

// Допустимые варианты размера страницы; совпадают с дефолтом стора (size: 10)
export const SIZE_OPTIONS = [10, 25, 50] as const;
export type PageSize = typeof SIZE_OPTIONS[number]; // 10 | 25 | 50

export interface PaginationBarProps {
  page: number;    // текущая страница, 1-based
  size: PageSize;  // текущий размер страницы
  total: number;   // общее число записей (PaginatedArticleResponse.total)
  onPageChange: (p: number) => void;
  onSizeChange: (s: PageSize) => void;
}

export function PaginationBar({
  page,
  size,
  total,
  onPageChange,
  onSizeChange,
}: PaginationBarProps) {
  // Защита от transient page:0 при быстрой смене фильтров в articleStore
  const safePage = Math.max(1, page);

  const { totalPages, pages, hasPrev, hasNext } = usePagination(total, safePage, size);

  // При одной странице (или нулевом total) пагинация бессмысленна
  if (totalPages <= 1) return null;

  return (
    <nav aria-label="Навигация по страницам" className="mt-4">
      <div className="flex flex-wrap items-center justify-between gap-y-2 gap-x-4">

        {/* Кнопки страниц: Prev + номера + Next */}
        <div className="flex items-center gap-1" role="group" aria-label="Страницы">
          <Button
            size="sm"
            variant="outline"
            disabled={!hasPrev}
            onClick={() => onPageChange(safePage - 1)}
            aria-label="Предыдущая страница"
          >
            ← Prev
          </Button>

          {pages.map((p, i) =>
            p === 'ellipsis' ? (
              // Элипсис не кликабелен — span, не Button
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
            aria-label="Следующая страница"
          >
            Next →
          </Button>
        </div>

        {/* Размер страницы */}
        <div className="flex items-center gap-1.5" role="group" aria-label="Строк на странице">
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
