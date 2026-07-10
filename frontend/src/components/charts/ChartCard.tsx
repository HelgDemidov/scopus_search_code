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
        // blur-xl (24px) поверх разреженных звёзд смазывал их в невидимое пятно —
        // blur-md (12px) сохраняет звёзды как узнаваемые мягкие точки света вместо
        // каши. /60 (было /50 → /40 → живая проверка в браузере показала: и то,
        // и другое читалось как "просто пустой фон", карточка визуально не
        // отличима от страницы) — более плотная подложка нужна, чтобы сама
        // ПОВЕРХНОСТЬ стекла была заметна, а не только блюр звёзд внутри неё.
        // Отдельный синий rim (вместо общего slate-700) даёт карточке край
        // "стекла", не завязанный на видимость самого блюра.
        translucent
          ? 'dark:bg-[#152236]/60 dark:backdrop-blur-md dark:border-blue-400/20'
          : 'dark:bg-[#152236] dark:border-slate-700',
      )}
    >
      {/* relative обязателен: без stacking context карточка красится ДО фикс.
          StarFieldCanvas (CSS2.1 Appendix E, non-positioned блок красится раньше
          позиционированного z-index:0) — звёзды ложились поверх непрозрачного
          фона карточки, заметнее всего на Journal Landscape Scatter (самая
          большая площадь однотонного фона). translucent зависит от этого же
          relative — backdrop-blur блюрит то, что нарисовано ДО карточки в
          порядке отрисовки; без relative канвас рисовался бы ПОСЛЕ и блюр на
          него бы не действовал. */}
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
