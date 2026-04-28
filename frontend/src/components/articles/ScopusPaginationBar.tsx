/**
 * ScopusPaginationBar — client-side пагинатор для live-результатов Scopus.
 * НЕ путать с PaginationBar (серверная пагинация GET /articles/).
 *
 * Scopus API отдаёт max 25 результатов за запрос — весь массив уже в памяти
 * (articleStore.liveResults). Этот компонент управляет только тем, какой
 * срез массива показывать: по 10 (до 3 страниц) или сразу все.
 *
 * Controlled-компонент: livePage живёт в useState родителя (HomePage),
 * liveSize — в articleStore.liveSize. Коллбэки onPageChange/onSizeChange
 * пробрасываются снаружи — компонент не читает стор напрямую.
 *
 * Монтируется рядом с блоком live-результатов в HomePage,
 * аналогично тому, как PaginationBar монтируется рядом с ArticleList.
 */

import { Button } from '../ui/button';

// Варианты отображения live-результатов — зеркало articleStore.liveSize
export type LiveSize = 10 | 'all';

export interface ScopusPaginationBarProps {
  livePage: number;                    // текущая страница, 1-based; живёт в useState родителя
  liveSize: LiveSize;                  // из articleStore.liveSize
  total: number;                       // liveResults.length
  onPageChange: (p: number) => void;   // сеттер livePage из родителя
  onSizeChange: (s: LiveSize) => void; // articleStore.setLiveSize
}

export function ScopusPaginationBar({
  livePage,
  liveSize,
  total,
  onPageChange,
  onSizeChange,
}: ScopusPaginationBarProps) {
  // При total <= 10 всё влезает без пагинации — ни страницы, ни тоггл не нужны
  if (total <= 10) return null;

  // Защита от transient livePage:0 при сбросе
  const safePage = Math.max(1, livePage);

  // Scopus API отдаёт max 25 результатов → max ceil(25/10) = 3 страницы
  // В режиме 'all' — одна виртуальная страница, навигация скрыта
  const totalPages = liveSize === 'all' ? 1 : Math.ceil(total / 10);
  const pageNumbers = Array.from({ length: totalPages }, (_, i) => i + 1);

  const hasPrev = safePage > 1;
  const hasNext = safePage < totalPages;

  // Вычисляем диапазон для строки состояния
  const from = liveSize === 'all' ? 1 : (safePage - 1) * 10 + 1;
  const to = liveSize === 'all' ? total : Math.min(safePage * 10, total);

  return (
    <nav aria-label="Навигация по результатам Scopus" className="mt-4">
      <div className="flex flex-wrap items-center justify-between gap-y-2 gap-x-4">

        {/* Строка состояния: «Показано X–Y из Z» */}
        <span className="text-xs text-slate-500 dark:text-slate-400 select-none">
          Показано {from}–{to} из {total}
        </span>

        {/* Кнопки страниц — только в режиме по 10 */}
        {liveSize === 10 && (
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
              aria-label="Следующая страница"
            >
              Next →
            </Button>
          </div>
        )}

        {/* Тоггл «По 10 / Все» */}
        <div className="flex items-center gap-1.5" role="group" aria-label="Режим отображения">
          <span className="text-xs text-slate-500 dark:text-slate-400 mr-1 select-none">
            Показать:
          </span>
          <Button
            size="sm"
            variant={liveSize === 10 ? 'default' : 'outline'}
            onClick={() => onSizeChange(10)}
          >
            По 10
          </Button>
          <Button
            size="sm"
            variant={liveSize === 'all' ? 'default' : 'outline'}
            onClick={() => onSizeChange('all')}
          >
            Все ({total})
          </Button>
        </div>

      </div>
    </nav>
  );
}
