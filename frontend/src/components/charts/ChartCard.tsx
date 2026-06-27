import type { ReactNode } from 'react';
import { Skeleton } from '../ui/skeleton';
import { DIMENSION_COLORS } from './chartColors';
import type { Dimension } from './chartColors';

interface ChartCardProps {
  title: string;
  dimension?: Dimension;
  isLoading?: boolean;
  skeletonHeight?: string;
  children: ReactNode;
  onTitleClick?: () => void;
  // Кнопка или иной элемент в правой части заголовка (например, кнопка удаления)
  headerAction?: ReactNode;
}

export function ChartCard({
  title,
  dimension,
  isLoading = false,
  skeletonHeight = 'h-64',
  children,
  onTitleClick,
  headerAction,
}: ChartCardProps) {
  const accentColor = dimension ? DIMENSION_COLORS[dimension].base : undefined;

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 flex flex-col gap-3 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center gap-2">
        {accentColor && (
          <span
            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: accentColor }}
          />
        )}
        <h3
          className={[
            'text-sm font-semibold text-slate-900 dark:text-slate-100',
            onTitleClick
              ? 'cursor-pointer hover:text-slate-600 dark:hover:text-slate-300 transition-colors'
              : '',
          ].join(' ')}
          onClick={onTitleClick}
        >
          {title}
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
