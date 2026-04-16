import { create } from 'zustand';
import { getStats } from '../api/stats';
import type { StatsResponse } from '../types/api';

// Интерфейс стора статистики — §4.2
// Единственный источник StatsResponse: используется в /explore и в ArticleFilters sidebar
interface StatsStore {
  stats: StatsResponse | null;
  isLoading: boolean;
  error: string | null;
  fetchStats: () => Promise<void>;
}

export const useStatsStore = create<StatsStore>((set, get) => ({
  stats: null,
  isLoading: false,
  error: null,

  // Загружаем статистику через GET /articles/stats (без JWT)
  // Вызывается один раз при монтировании /explore и главной страницы
  fetchStats: async () => {
    // Не повторяем запрос, если данные уже загружены
    if (get().stats !== null) return;
    set({ isLoading: true, error: null });
    try {
      const stats: StatsResponse = await getStats();
      set({ stats, isLoading: false });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load statistics';
      set({ error: message, isLoading: false });
    }
  },
}));
