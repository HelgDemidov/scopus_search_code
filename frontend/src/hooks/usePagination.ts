import { useMemo } from 'react';

// Тип одного элемента массива pages: номер страницы или разделитель
export type PageItem = number | 'ellipsis';

// Результат хука по §4.1
export interface UsePaginationResult {
  totalPages: number;
  pages: PageItem[];   // например: [1, 'ellipsis', 4, 5, 6, 'ellipsis', 12]
  hasPrev: boolean;
  hasNext: boolean;
}

/**
 * Хук пагинации для shadcn <PaginationItem> / <PaginationLink>.
 * Логика вычисления диапазона страниц с ellipsis — §4.1.
 *
 * @param total  — общее количество записей (поле total из PaginatedArticleResponse)
 * @param page   — текущая страница (1-based)
 * @param size   — размер страницы
 */
export function usePagination(
  total: number,
  page: number,
  size: number,
): UsePaginationResult {
  return useMemo(() => {
    // Общее число страниц; минимум 1, чтобы не рендерить пустую пагинацию
    const totalPages = Math.max(1, Math.ceil(total / size));

    const hasPrev = page > 1;
    const hasNext = page < totalPages;

    // Строим массив элементов с ellipsis
    const pages = buildPages(page, totalPages);

    return { totalPages, pages, hasPrev, hasNext };
  }, [total, page, size]);
}

// Вспомогательная чистая функция — вынесена для тестируемости
function buildPages(current: number, total: number): PageItem[] {
  // При малом числе страниц ellipsis не нужен
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  // Окно вокруг текущей страницы: [current-1, current, current+1]
  const delta = 1;
  const rangeStart = Math.max(2, current - delta);
  const rangeEnd   = Math.min(total - 1, current + delta);

  const middle: number[] = [];
  for (let i = rangeStart; i <= rangeEnd; i++) {
    middle.push(i);
  }

  const result: PageItem[] = [1];

  // Ellipsis слева: если между 1 и началом окна пропуск больше 1 страницы
  if (rangeStart > 2) {
    result.push('ellipsis');
  }

  result.push(...middle);

  // Ellipsis справа: если между концом окна и последней страницей пропуск > 1
  if (rangeEnd < total - 1) {
    result.push('ellipsis');
  }

  result.push(total);

  return result;
}
