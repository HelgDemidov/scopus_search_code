import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from './pagination';
import { usePagination } from '../../hooks/usePagination';

interface PaginationControlsProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  // Передавайте total + size чтобы usePagination точно посчитал ellipsis;
  // если не переданы — вычисляем total из totalPages * size (приблизительно)
  total?: number;
  size?: number;
}

export function PaginationControls({
  page,
  totalPages,
  onPageChange,
  total,
  size = 20,
}: PaginationControlsProps) {
  // Реальная сигнатура хука: usePagination(total, page, size)
  const effectiveTotal = total ?? totalPages * size;
  const { pages, hasPrev, hasNext } = usePagination(effectiveTotal, page, size);

  if (totalPages <= 1) return null;

  return (
    <Pagination>
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious
            onClick={() => hasPrev && onPageChange(page - 1)}
            aria-disabled={!hasPrev}
            className={!hasPrev ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
          />
        </PaginationItem>

        {pages.map((p, i) =>
          p === 'ellipsis' ? (
            <PaginationItem key={`ellipsis-${i}`}>
              <PaginationEllipsis />
            </PaginationItem>
          ) : (
            <PaginationItem key={p}>
              <PaginationLink
                isActive={p === page}
                onClick={() => onPageChange(p)}
                className="cursor-pointer"
              >
                {p}
              </PaginationLink>
            </PaginationItem>
          ),
        )}

        <PaginationItem>
          <PaginationNext
            onClick={() => hasNext && onPageChange(page + 1)}
            aria-disabled={!hasNext}
            className={!hasNext ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}
