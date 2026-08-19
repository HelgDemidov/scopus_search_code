import { create } from 'zustand';
import { getStats, getKpiTotals } from '../api/stats';
import type { StatsResponse, KpiTotalsResponse } from '../types/api';

// Интерфейс стора статистики — §4.2
// Единственный источник StatsResponse: используется в /explore и в ArticleFilters sidebar
//
// kpiTotals — отдельный, более лёгкий источник (быстрый фикс 2026-08-14,
// docs/backend-performance/explore-kpi-summary/spec.md): 6 плиток KpiRow раньше ждали
// весь stats (10 последовательных агрегатов на бэкенде, ~9.7с на холодном
// Redis-кэше), хотя нужны им только эти 6 скаляров. isLoading/stats остаются
// как есть — их всё ещё ждут DimensionDrawer и стационарные графики /explore.
interface StatsStore {
  stats: StatsResponse | null;
  isLoading: boolean;
  error: string | null;
  fetchStats: () => Promise<void>;

  kpiTotals: KpiTotalsResponse | null;
  isKpiLoading: boolean;
  kpiError: string | null;
  fetchKpiTotals: () => Promise<void>;
}

export const useStatsStore = create<StatsStore>((set, get) => ({
  stats: null,
  isLoading: false,
  error: null,

  // Загружаем статистику через GET /articles/stats (без JWT)
  // Вызывается из двух мест почти одновременно на одной загрузке /explore —
  // App.tsx (глобально, при старте) и ExplorePage.tsx (в своём useEffect)
  fetchStats: async () => {
    // isLoading в guard'е, а не только stats !== null — иначе App.tsx и
    // ExplorePage, монтируясь почти одновременно, оба проходят проверку до
    // того, как первый запрос успеет разрешиться, и дублируют вызов (тот же
    // баг, что уже был найден и починён для fetchKpiTotals ниже — здесь его
    // просто забыли применить заодно).
    if (get().stats !== null || get().isLoading) return;
    set({ isLoading: true, error: null });
    try {
      const stats: StatsResponse = await getStats();
      set({ stats, isLoading: false });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load statistics';
      set({ error: message, isLoading: false });
    }
  },

  kpiTotals: null,
  isKpiLoading: false,
  kpiError: null,

  // GET /articles/stats/summary — вызывается там же, где fetchStats (App.tsx +
  // ExplorePage), но независимо от него: не должна ждать/блокировать stats.
  fetchKpiTotals: async () => {
    // isKpiLoading в guard'е, а не только kpiTotals !== null — иначе App.tsx
    // и ExplorePage, монтируясь почти одновременно, оба проходят проверку
    // до того, как первый запрос успеет разрешиться, и дублируют вызов.
    if (get().kpiTotals !== null || get().isKpiLoading) return;
    set({ isKpiLoading: true, kpiError: null });
    try {
      const kpiTotals: KpiTotalsResponse = await getKpiTotals();
      set({ kpiTotals, isKpiLoading: false });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load KPI totals';
      set({ kpiError: message, isKpiLoading: false });
    }
  },
}));
