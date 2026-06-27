import { useStatsStore } from '../../stores/statsStore';
import { useDashboardStore } from '../../stores/dashboardStore';
import { KpiTile } from './KpiTile';
import type { Dimension } from '../charts/chartColors';

interface KpiConfig {
  dimension: Dimension;
  label: string;
  getValue: (stats: NonNullable<ReturnType<typeof useStatsStore.getState>['stats']>) => number;
}

// Конфигурация 6 тайлов — порядок соответствует компоновке дашборда
const KPI_TILES: KpiConfig[] = [
  {
    dimension: 'year',
    label: 'Articles indexed',
    getValue: (s) => s.total_articles,
  },
  {
    dimension: 'country',
    label: 'Countries',
    getValue: (s) => s.total_countries,
  },
  {
    dimension: 'open_access',
    label: 'Open Access',
    getValue: (s) => s.open_access_count,
  },
  {
    dimension: 'doc_type',
    label: 'Document types',
    getValue: (s) => s.by_doc_type.length,
  },
  {
    dimension: 'journal',
    label: 'Journals',
    getValue: (s) => s.total_journals,
  },
  {
    dimension: 'author',
    label: 'Authors',
    getValue: (s) => s.total_authors,
  },
];

// Ряд из 6 кликабельных KPI-тайлов над дашбордом.
// Клик открывает Drawer с детальным видом по выбранному измерению.
export function KpiRow() {
  const { stats, isLoading } = useStatsStore();
  const { drawerDimension, openDrawer, closeDrawer } = useDashboardStore();

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
