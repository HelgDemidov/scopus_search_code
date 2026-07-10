import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';
import { Skeleton } from '../ui/skeleton';
import type { Dimension } from './chartColors';
import { useDimensionColors } from '../../hooks/useDimensionColors';

interface ChartCardProps {
  title: string;
  dimension?: Dimension;
  isLoading?: boolean;
  skeletonHeight?: string;
  children: ReactNode;
  onTitleClick?: () => void;
  // Кнопка или иной элемент в правой части заголовка (например, кнопка удаления)
  headerAction?: ReactNode;
  // "Матовое стекло" вместо сплошной подложки в dark mode — звёздное небо видно
  // сквозь блюр вместо глухой стены. Опционально (не на всех ChartCard, например
  // не на карточках Table Builder/personal mode) — см. память по /explore.
  translucent?: boolean;
}

export function ChartCard({
  title,
  dimension,
  isLoading = false,
  skeletonHeight = 'h-64',
  children,
  onTitleClick,
  headerAction,
  translucent = false,
}: ChartCardProps) {
  const dimColors = useDimensionColors(dimension ?? 'year');
  const accentColor = dimension ? dimColors.base : undefined;

  return (
    <div
      className={cn(
        'relative rounded-xl border border-slate-200 bg-white p-5 flex flex-col gap-3 shadow-sm hover:shadow-md transition-shadow',
        // БЕЗ backdrop-blur (было в предыдущих итерациях, убрано 2026-07-11):
        // разреженные тусклые звёзды после ЛЮБОГО блюра размывались в
        // неразличимое пятно — это свойство самого контента (редкие тусклые
        // точки света), а не конкретного механизма блюра. Обычная альфа-
        // прозрачность (без backdrop-filter) показывает канвас надёжнее —
        // не подчиняется границам stacking context/"backdrop root", в
        // отличие от backdrop-filter (см. KpiTile.tsx — тот же принцип,
        // ~10% заливки, без блюра, звёзды видны чётко). /35 — стартовая
        // точка калибровки, синий rim (вместо общего slate-700) даёт
        // карточке край "стекла" независимо от заливки.
        translucent
          ? 'dark:bg-[#152236]/65 dark:border-blue-400/20'
          : 'dark:bg-[#152236] dark:border-slate-700',
      )}
    >
      {/* relative — сохранился с изначального фикса паттерна отрисовки (CSS2.1
          Appendix E: непозиционированный блок красится раньше позиционированного
          z-index:0 канваса), но с 2026-07-11 (isolate на RootLayout, см.
          router.tsx) уже не обязателен per-компонентно — весь сайт красится
          после канваса на уровне корня. Оставлен как есть, безвреден. */}
      <div className="flex items-center gap-2">
        {accentColor && (
          <span
            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: accentColor }}
          />
        )}
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          {onTitleClick ? (
            <button
              type="button"
              onClick={onTitleClick}
              className="text-left cursor-pointer hover:text-slate-600 dark:hover:text-slate-300 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
            >
              {title}
            </button>
          ) : (
            title
          )}
        </h3>
        {headerAction && <div className="ml-auto flex-shrink-0">{headerAction}</div>}
      </div>

      {isLoading ? (
        <Skeleton className={`${skeletonHeight} w-full rounded-lg`} />
      ) : (
        children
      )}
    </div>
  );
}
