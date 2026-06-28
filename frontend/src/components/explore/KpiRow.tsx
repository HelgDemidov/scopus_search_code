import { useTranslation } from 'react-i18next';
import { useStatsStore } from '../../stores/statsStore';
import { useDashboardStore } from '../../stores/dashboardStore';
import { KpiTile } from './KpiTile';
import type { Dimension } from '../charts/chartColors';
import type { TFunction } from 'i18next';

type Stats = NonNullable<ReturnType<typeof useStatsStore.getState>['stats']>;

interface KpiConfig {
  dimension: Dimension;
  getLabel: (count: number) => string;
  getValue: (stats: Stats) => number;
}

function getKpiLabel(dim: Dimension, count: number, t: TFunction): string {
  switch (dim) {
    case 'year':        return t('explore.kpi.articlesIndexed', { count });
    case 'country':     return t('explore.kpi.countries', { count });
    case 'open_access': return t('explore.kpi.openAccess');
    case 'doc_type':    return t('explore.kpi.docTypes', { count });
    case 'journal':     return t('explore.kpi.journals', { count });
    case 'author':      return t('explore.kpi.authors', { count });
  }
}

// Ряд из 6 кликабельных KPI-тайлов над дашбордом.
// Клик открывает Drawer с детальным видом по выбранному измерению.
export function KpiRow() {
  const { t } = useTranslation();
  const { stats, isLoading } = useStatsStore();
  const { drawerDimension, openDrawer, closeDrawer } = useDashboardStore();

  const KPI_TILES: KpiConfig[] = [
    { dimension: 'year',        getLabel: (n) => getKpiLabel('year',        n, t), getValue: (s) => s.total_articles },
    { dimension: 'country',     getLabel: (n) => getKpiLabel('country',     n, t), getValue: (s) => s.total_countries },
    { dimension: 'open_access', getLabel: (n) => getKpiLabel('open_access', n, t), getValue: (s) => s.open_access_count },
    { dimension: 'doc_type',    getLabel: (n) => getKpiLabel('doc_type',    n, t), getValue: (s) => s.by_doc_type.length },
    { dimension: 'journal',     getLabel: (n) => getKpiLabel('journal',     n, t), getValue: (s) => s.total_journals },
    { dimension: 'author',      getLabel: (n) => getKpiLabel('author',      n, t), getValue: (s) => s.total_authors },
  ];

  function handleTileClick(dimension: Dimension) {
    if (drawerDimension === dimension) {
      closeDrawer();
    } else {
      openDrawer(dimension);
    }
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {KPI_TILES.map(({ dimension, getLabel, getValue }) => {
        const count = stats ? getValue(stats) : 0;
        return (
          <KpiTile
            key={dimension}
            label={getLabel(count)}
            value={count}
            dimension={dimension}
            isActive={drawerDimension === dimension}
            isLoading={isLoading}
            onClick={() => handleTileClick(dimension)}
          />
        );
      })}
    </div>
  );
}
