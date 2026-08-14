import { useTranslation } from 'react-i18next';
import { useStatsStore } from '../../stores/statsStore';
import { useDashboardStore } from '../../stores/dashboardStore';
import { KpiTile } from './KpiTile';
import { getKpiLabel } from './kpiLabels';
import type { Dimension } from '../charts/chartColors';

// KpiRow читает kpiTotals (GET /articles/stats/summary), не полный stats —
// быстрый фикс 2026-08-14 (docs/backend-performance/explore-kpi-summary/spec.md):
// плитки не должны ждать 9 остальных тяжёлых агрегатов get_stats(), нужных
// только DimensionDrawer/стационарным графикам ниже KPI-ряда.
type KpiTotals = NonNullable<ReturnType<typeof useStatsStore.getState>['kpiTotals']>;

interface KpiConfig {
  dimension: Dimension;
  getLabel: (count: number) => string;
  getValue: (totals: KpiTotals) => number;
}

// ---------------------------------------------------------------------------
// KpiTileRow — общая презентационная сердцевина (docs/explore-analytics/explore-personal-redesign/
// spec.md §1.2 п.4): не читает никакой стор, только рендерит уже вычисленные
// тайлы. Формулы вычисления value у collection/personal разные (см. spec.md
// §1.1) — переиспользуется только оболочка, не сама формула.
// ---------------------------------------------------------------------------

export interface KpiTileSpec {
  dimension: Dimension;
  label: string;
  value: number;
}

interface KpiTileRowProps {
  tiles: KpiTileSpec[];
  isLoading: boolean;
  drawerDimension: Dimension | null;
  onTileClick: (dimension: Dimension) => void;
  columnsClassName?: string;
}

export function KpiTileRow({
  tiles,
  isLoading,
  drawerDimension,
  onTileClick,
  columnsClassName = 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3',
}: KpiTileRowProps) {
  return (
    <div className={columnsClassName}>
      {tiles.map(({ dimension, label, value }) => (
        <KpiTile
          key={dimension}
          label={label}
          value={value}
          dimension={dimension}
          isActive={drawerDimension === dimension}
          isLoading={isLoading}
          onClick={() => onTileClick(dimension)}
        />
      ))}
    </div>
  );
}

// Ряд из 6 кликабельных KPI-тайлов над дашбордом (collection mode, поведение
// не меняется). Клик открывает Drawer с детальным видом по выбранному измерению.
export function KpiRow() {
  const { t } = useTranslation();
  const { kpiTotals, isKpiLoading } = useStatsStore();
  const { drawerDimension, openDrawer, closeDrawer } = useDashboardStore();

  const KPI_TILES: KpiConfig[] = [
    { dimension: 'year',        getLabel: (n) => getKpiLabel('year',        n, t), getValue: (s) => s.total_articles },
    { dimension: 'country',     getLabel: (n) => getKpiLabel('country',     n, t), getValue: (s) => s.total_countries },
    { dimension: 'open_access', getLabel: (n) => getKpiLabel('open_access', n, t), getValue: (s) => s.open_access_count },
    { dimension: 'doc_type',    getLabel: (n) => getKpiLabel('doc_type',    n, t), getValue: (s) => s.total_doc_types },
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

  const tiles: KpiTileSpec[] = KPI_TILES.map(({ dimension, getLabel, getValue }) => {
    const count = kpiTotals ? getValue(kpiTotals) : 0;
    return { dimension, label: getLabel(count), value: count };
  });

  return (
    <KpiTileRow
      tiles={tiles}
      isLoading={isKpiLoading}
      drawerDimension={drawerDimension}
      onTileClick={handleTileClick}
    />
  );
}
