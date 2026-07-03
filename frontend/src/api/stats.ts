// API-функции для статистики коллекции
//
// getStats         — GET /articles/stats (без фильтров)
// getFilteredStats — GET /articles/stats (с фильтрами Cross-filter V2)
// selectionToParams — маппинг ActiveSelection → query-params

import { apiClient } from './client';
import type { ActiveSelection } from '../stores/dashboardStore';
import type { JournalImpactPoint, StatsResponse } from '../types/api';

export async function getStats(): Promise<StatsResponse> {
  const response = await apiClient.get<StatsResponse>('/articles/stats');
  return response.data;
}

// Journal Landscape Scatter (docs/explore-table-builder/spec.md §1) — не часть
// StatsResponse/get_stats(): значение зависит от рантайм-параметра слайдера
// окна зрелости, отдельный некэшируемый запрос при каждой смене maxYear.
export async function getJournalImpact(maxYear: number, signal?: AbortSignal): Promise<JournalImpactPoint[]> {
  const response = await apiClient.get<JournalImpactPoint[]>('/articles/stats/journal-impact', {
    params: { max_year: maxYear },
    signal,
  });
  return response.data;
}

// ---------------------------------------------------------------------------
// Cross-filter V2: маппинг ActiveSelection → backend query params
// Возвращает null для неподдерживаемых измерений (journal, author).
// ---------------------------------------------------------------------------

export type FilterParams =
  | { countries: string[] }
  | { doc_types: string[] }
  | { open_access: boolean }
  | { year_from: number; year_to: number };

export function selectionToParams(selection: ActiveSelection): FilterParams | null {
  switch (selection.dimension) {
    case 'country':
      return { countries: [selection.value] };
    case 'doc_type':
      return { doc_types: [selection.value] };
    case 'open_access':
      return { open_access: selection.value === 'Open Access' };
    case 'year':
      return { year_from: Number(selection.value), year_to: Number(selection.value) };
    default:
      // journal, author — серверная фильтрация не поддерживается; V1 dimming
      return null;
  }
}

export async function getFilteredStats(
  selection: ActiveSelection,
  signal?: AbortSignal,
): Promise<StatsResponse> {
  const params = selectionToParams(selection);
  const response = await apiClient.get<StatsResponse>('/articles/stats', { params: params ?? {}, signal });
  return response.data;
}
