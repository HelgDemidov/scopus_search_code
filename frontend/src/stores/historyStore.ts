import { create } from 'zustand';
import { getSearchHistory } from '../api/articles';
import type { SearchHistoryItem, ArticleClientFilters } from '../types/api';

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
  resetFilters: () => void;
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

  resetFilters: () => {
    set({ historyFilters: {} });
  },
}));
