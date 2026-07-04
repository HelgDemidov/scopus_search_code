import { useTranslation } from 'react-i18next';
import { useDashboardStore } from '../../stores/dashboardStore';
import { KpiTileRow } from './KpiRow';
import type { KpiTileSpec } from './KpiRow';
import { getKpiLabel } from './kpiLabels';
import type { Dimension } from '../charts/chartColors';
import type { SearchStatsResponse } from '../../types/api';

// 5 тайлов, без author — SearchStatsResponse не предоставляет by_author/top_authors
// (docs/explore-personal-redesign/spec.md §1.1: добавлять агрегат ради одного тайла
// не оправдано, personal и так закрывает автобиографический пробел работой 2).
type PersonalDimension = Exclude<Dimension, 'author'>;

const PERSONAL_DIMENSIONS: PersonalDimension[] = ['year', 'country', 'open_access', 'doc_type', 'journal'];

function getPersonalTileValue(dimension: PersonalDimension, stats: SearchStatsResponse): number {
  switch (dimension) {
    case 'year':        return stats.total;
    case 'country':     return stats.by_country.length;
    case 'open_access': return stats.by_open_access.find((d) => d.label === 'true')?.count ?? 0;
    case 'doc_type':    return stats.by_doc_type.length;
    case 'journal':     return stats.by_journal.length;
  }
}

interface PersonalKpiRowProps {
  stats: SearchStatsResponse | null;
  isLoading: boolean;
}

// Ряд из 5 кликабельных KPI-тайлов для /explore?mode=personal (docs/explore-personal-
// redesign/spec.md §1). Переиспользует презентационную KpiTileRow из KpiRow.tsx —
// формулы вычисления value personal-специфичны (SearchStatsResponse ≠ StatsResponse),
// поэтому не через общий тип, а через отдельный getPersonalTileValue().
export function PersonalKpiRow({ stats, isLoading }: PersonalKpiRowProps) {
  const { t } = useTranslation();
  const { drawerDimension, openDrawer, closeDrawer } = useDashboardStore();

  function handleTileClick(dimension: Dimension) {
    if (drawerDimension === dimension) {
      closeDrawer();
    } else {
      openDrawer(dimension);
    }
  }

  const tiles: KpiTileSpec[] = PERSONAL_DIMENSIONS.map((dimension) => {
    const value = stats ? getPersonalTileValue(dimension, stats) : 0;
    // 'year' — единственная метка, где текст коллекции ("Статей в индексе") семантически
    // неверен для personal ("найдено", не "проиндексировано") — остальные 4 переиспользуют
    // те же generic-ключи, что и collection (countries/openAccess/docTypes/journals).
    const label = dimension === 'year'
      ? t('explore.kpi.articlesFound', { count: value })
      : getKpiLabel(dimension, value, t);
    return { dimension, label, value };
  });

  return (
    <KpiTileRow
      tiles={tiles}
      isLoading={isLoading}
      drawerDimension={drawerDimension}
      onTileClick={handleTileClick}
      columnsClassName="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3"
    />
  );
}
