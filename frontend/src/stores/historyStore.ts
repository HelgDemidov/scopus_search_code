import { create } from 'zustand';
import { getSearchHistory } from '../api/articles';
import type { SearchHistoryItem, LabelCount, ArticleClientFilters } from '../types/api';

// HistoryFilters = ArticleClientFilters: client-side фильтры переехали
// из articleStore сюда согласно §1.3 (filter-slice split)
export type HistoryFilters = ArticleClientFilters;

interface HistoryStore {
  items: SearchHistoryItem[];
  isLoading: boolean;
  error: string | null;
  historyFilters: HistoryFilters;
  fetchHistory: () => Promise<void>;
  setHistoryFilters: (filters: Partial<HistoryFilters>) => void;
}

export const useHistoryStore = create<HistoryStore>((set) => ({
  items: [],
  isLoading: false,
  error: null,
  historyFilters: {},

  fetchHistory: async () => {
    set({ isLoading: true, error: null });
    try {
      const items = await getSearchHistory();
      set({ items, isLoading: false });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Не удалось загрузить историю';
      set({ error: message, isLoading: false, items: [] });
    }
  },

  setHistoryFilters: (filters: Partial<HistoryFilters>) => {
    set((state) => ({ historyFilters: { ...state.historyFilters, ...filters } }));
  },
}));

// ---------------------------------------------------------------------------
// Чистые селекторы для агрегации истории в LabelCount[]
// ---------------------------------------------------------------------------

const MISSING = '\u00abНе указано\u00bb';

function incr(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function toLabelCount(map: Map<string, number>): LabelCount[] {
  return Array.from(map.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

// Возвращает массив строк из item.filters[key] — поддерживает scalar/array
function extractValues(filters: Record<string, unknown>, key: string): string[] {
  const raw = filters?.[key];
  if (raw === undefined || raw === null) return [];
  if (Array.isArray(raw)) {
    const arr = raw
      .filter((v) => v !== null && v !== undefined && v !== '')
      .map((v) => String(v));
    return arr.length ? arr : [];
  }
  if (raw === '') return [];
  return [String(raw)];
}

export function selectByYear(items: SearchHistoryItem[]): LabelCount[] {
  const map = new Map<string, number>();
  for (const item of items) {
    const iso = item.created_at;
    const year = iso && iso.length >= 4 ? iso.slice(0, 4) : MISSING;
    incr(map, year || MISSING);
  }
  return toLabelCount(map);
}

function selectByFilterKey(
  items: SearchHistoryItem[],
  keys: string[],
): LabelCount[] {
  const map = new Map<string, number>();
  for (const item of items) {
    const filters = item.filters ?? {};
    let collected: string[] = [];
    for (const key of keys) {
      collected = collected.concat(extractValues(filters, key));
    }
    if (collected.length === 0) {
      incr(map, MISSING);
    } else {
      for (const v of collected) incr(map, v);
    }
  }
  return toLabelCount(map);
}

export function selectByDocType(items: SearchHistoryItem[]): LabelCount[] {
  return selectByFilterKey(items, ['docTypes', 'doc_types', 'docType', 'document_type']);
}

export function selectByCountry(items: SearchHistoryItem[]): LabelCount[] {
  return selectByFilterKey(items, ['countries', 'country', 'affiliation_country']);
}

export function selectByJournal(items: SearchHistoryItem[]): LabelCount[] {
  return selectByFilterKey(items, ['journals', 'journal']);
}
