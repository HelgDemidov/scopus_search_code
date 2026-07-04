import type { Dimension } from '../charts/chartColors';
import type { TFunction } from 'i18next';

// Вынесено из KpiRow.tsx — react-refresh/only-export-components не разрешает
// смешивать non-component export с компонентами в одном файле (тот же паттерн,
// что router.tsx был вынесен из App.tsx).
export function getKpiLabel(dim: Dimension, count: number, t: TFunction): string {
  switch (dim) {
    case 'year':        return t('explore.kpi.articlesIndexed', { count });
    case 'country':     return t('explore.kpi.countries', { count });
    case 'open_access': return t('explore.kpi.openAccess');
    case 'doc_type':    return t('explore.kpi.docTypes', { count });
    case 'journal':     return t('explore.kpi.journals', { count });
    case 'author':      return t('explore.kpi.authors', { count });
  }
}
