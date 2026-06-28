import { useTranslation } from 'react-i18next';
import { useDashboardStore } from '../../stores/dashboardStore';
import { useStatsStore } from '../../stores/statsStore';
import { DIMENSION_COLORS, formatCount } from '../charts/chartColors';
import type { Dimension } from '../charts/chartColors';

export function ActiveFilterBanner() {
  const { t } = useTranslation();
  const { activeSelection, filteredStats, filteredStatsLoading, clearSelection, clearFilteredStats } =
    useDashboardStore();
  const globalStats = useStatsStore((s) => s.stats);

  if (!activeSelection) return null;

  const colors = DIMENSION_COLORS[activeSelection.dimension];
  const dimensionLabelMap: Record<Dimension, string> = {
    year:        t('explore.dimensionLabels.year'),
    country:     t('explore.dimensionLabels.country'),
    doc_type:    t('explore.dimensionLabels.doc_type'),
    journal:     t('explore.dimensionLabels.journal'),
    open_access: t('explore.dimensionLabels.open_access'),
    author:      t('explore.dimensionLabels.author'),
  };
  const dimensionLabel = dimensionLabelMap[activeSelection.dimension];

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
            {t('explore.filterBannerArticles', {
              filtered: formatCount(filteredCount),
              total: formatCount(globalCount),
            })}
          </span>
        )}

        {/* Индикатор загрузки */}
        {filteredStatsLoading && (
          <span className="ml-2 text-slate-400 dark:text-slate-500" aria-label={t('a11y.loadingStats')}>
            ···
          </span>
        )}
      </span>

      {/* Кнопка сброса */}
      <button
        onClick={handleClear}
        className="flex-shrink-0 flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:text-slate-700 hover:bg-white/60 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-700/40 transition-colors"
        aria-label={t('a11y.clearFilter')}
      >
        <span aria-hidden="true">×</span>
        {t('explore.clearFilter')}
      </button>
    </div>
  );
}
