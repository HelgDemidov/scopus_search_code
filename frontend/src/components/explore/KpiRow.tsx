import { useTranslation } from 'react-i18next';
import { useStatsStore } from '../../stores/statsStore';
import { useDashboardStore } from '../../stores/dashboardStore';
import { KpiTile } from './KpiTile';
import type { Dimension } from '../charts/chartColors';

interface KpiConfig {
  dimension: Dimension;
  label: string;
  getValue: (stats: NonNullable<ReturnType<typeof useStatsStore.getState>['stats']>) => number;
}

// Ряд из 6 кликабельных KPI-тайлов над дашбордом.
// Клик открывает Drawer с детальным видом по выбранному измерению.
export function KpiRow() {
  const { t } = useTranslation();
  const { stats, isLoading } = useStatsStore();
  const { drawerDimension, openDrawer, closeDrawer } = useDashboardStore();

  const KPI_TILES: KpiConfig[] = [
    { dimension: 'year',        label: t('explore.kpi.articlesIndexed'), getValue: (s) => s.total_articles },
    { dimension: 'country',     label: t('explore.kpi.countries'),       getValue: (s) => s.total_countries },
    { dimension: 'open_access', label: t('explore.kpi.openAccess'),      getValue: (s) => s.open_access_count },
    { dimension: 'doc_type',    label: t('explore.kpi.docTypes'),        getValue: (s) => s.by_doc_type.length },
    { dimension: 'journal',     label: t('explore.kpi.journals'),        getValue: (s) => s.total_journals },
    { dimension: 'author',      label: t('explore.kpi.authors'),         getValue: (s) => s.total_authors },
  ];

  function handleTileClick(dimension: Dimension) {
    // Повторный клик по открытому → закрыть
    if (drawerDimension === dimension) {
      closeDrawer();
    } else {
      openDrawer(dimension);
    }
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {KPI_TILES.map(({ dimension, label, getValue }) => (
        <KpiTile
          key={dimension}
          label={label}
          value={stats ? getValue(stats) : 0}
          dimension={dimension}
          isActive={drawerDimension === dimension}
          isLoading={isLoading}
          onClick={() => handleTileClick(dimension)}
        />
      ))}
    </div>
  );
}
