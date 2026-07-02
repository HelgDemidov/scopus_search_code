import { formatCount } from '../charts/chartColors';
import type { Dimension } from '../charts/chartColors';
import { useDimensionColors } from '../../hooks/useDimensionColors';

interface KpiTileProps {
  label: string;
  value: number;
  dimension: Dimension;
  isActive: boolean;
  isLoading?: boolean;
  onClick: () => void;
}

// Кликабельный KPI-тайл с цветовым профилем измерения.
// Активный тайл подсвечивается кольцом + тонированным фоном измерения.
export function KpiTile({ label, value, dimension, isActive, isLoading = false, onClick }: KpiTileProps) {
  const colors = useDimensionColors(dimension);

  // Цвета через inline-стили: Tailwind не поддерживает динамические имена классов.
  // Фон тайла всегда тонирован цветом измерения (~10% непрозрачности — заявленная
  // «прозрачность 90%», одинаково в обеих темах); boxShadow-кольцо — единственный
  // индикатор активного состояния поверх этого фона (без сдвига элемента, в отличие
  // от border).
  const tileStyle = {
    backgroundColor: `${colors.base}1A`, // ~10% opacity hex suffix
    ...(isActive ? { boxShadow: `0 0 0 2px ${colors.base}` } : {}),
  };

  return (
    <button
      onClick={onClick}
      className="rounded-xl border border-slate-200 dark:border-slate-700 p-5 flex flex-col gap-1 cursor-pointer text-left w-full transition-all hover:border-slate-300 dark:hover:border-slate-600 hover:shadow-sm"
      style={tileStyle}
      aria-pressed={isActive}
    >
      {isLoading ? (
        <>
          <div className="h-7 w-24 rounded bg-slate-200 dark:bg-slate-700 animate-pulse" />
          <div className="h-4 w-32 mt-1 rounded bg-slate-200 dark:bg-slate-700 animate-pulse" />
        </>
      ) : (
        <>
          {/* Цветная полоса над числом — маркер измерения */}
          <div
            className="w-6 h-1 rounded-full mb-1"
            style={{ backgroundColor: colors.base }}
          />
          <p className="text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
            {formatCount(value)}
          </p>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
            {label}
          </p>
        </>
      )}
    </button>
  );
}
