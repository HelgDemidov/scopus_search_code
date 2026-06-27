import { useDashboardStore } from '../../stores/dashboardStore';
import { useStatsStore } from '../../stores/statsStore';
import { DIMENSION_COLORS, DIMENSION_LABELS, formatCount } from '../charts/chartColors';

export function ActiveFilterBanner() {
  const { activeSelection, filteredStats, filteredStatsLoading, clearSelection, clearFilteredStats } =
    useDashboardStore();
  const globalStats = useStatsStore((s) => s.stats);

  if (!activeSelection) return null;

  const colors = DIMENSION_COLORS[activeSelection.dimension];
  const dimensionLabel = DIMENSION_LABELS[activeSelection.dimension];

  const filteredCount = filteredStats?.total_articles ?? null;
  const globalCount = globalStats?.total_articles ?? null;

  function handleClear() {
    clearSelection();
    clearFilteredStats();
  }

  return (
    <div
      className="flex items-center gap-3 rounded-xl border px-4 py-3 text-sm"
      style={{
        borderColor: colors.dimmed,
        backgroundColor: colors.dimmed + '33', // ~20% opacity hex
      }}
      role="status"
      aria-live="polite"
    >
      {/* Цветная точка измерения */}
      <span
        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
        style={{ backgroundColor: colors.base }}
        aria-hidden="true"
      />

      {/* Описание фильтра */}
      <span className="text-slate-700 dark:text-slate-300 flex-1 min-w-0">
        <span className="font-medium">{dimensionLabel}</span>
        {' → '}
        <span className="font-semibold truncate">{activeSelection.value}</span>

        {/* Счётчик: X of Y articles */}
        {filteredCount !== null && globalCount !== null && (
          <span className="ml-2 text-slate-500 dark:text-slate-400">
            — {formatCount(filteredCount)} of {formatCount(globalCount)} articles
          </span>
        )}

        {/* Индикатор загрузки */}
        {filteredStatsLoading && (
          <span className="ml-2 text-slate-400 dark:text-slate-500" aria-label="Loading filtered stats">
            ···
          </span>
        )}
      </span>

      {/* Кнопка сброса */}
      <button
        onClick={handleClear}
        className="flex-shrink-0 flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:text-slate-700 hover:bg-white/60 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-700/40 transition-colors"
        aria-label="Clear filter"
      >
        <span aria-hidden="true">×</span>
        Clear filter
      </button>
    </div>
  );
}
