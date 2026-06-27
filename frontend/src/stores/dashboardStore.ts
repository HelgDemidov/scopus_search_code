import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { getFilteredStats, selectionToParams } from '../api/stats';
import type { Dimension, ChartType } from '../components/charts/chartColors';
import type { StatsResponse } from '../types/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ActiveSelection {
  dimension: Dimension;
  value: string;
}

export interface BuilderCard {
  id: string;
  dimension: Dimension;
  chartType: ChartType;
}

interface DashboardStore {
  // Cross-filter selection (V1: визуальное выделение; V2: серверная фильтрация)
  activeSelection: ActiveSelection | null;
  setSelection: (sel: ActiveSelection | null) => void;
  clearSelection: () => void;

  // Drawer: детальный вид по клику на KPI тайл или bar-элемент
  drawerDimension: Dimension | null;
  openDrawer: (d: Dimension) => void;
  closeDrawer: () => void;

  // Chart Builder: пользовательские карточки (persist в localStorage)
  builderCards: BuilderCard[];
  addBuilderCard: (card: Omit<BuilderCard, 'id'>) => void;
  removeBuilderCard: (id: string) => void;

  // Cross-filter V2: серверная фильтрация статистики
  filteredStats: StatsResponse | null;
  filteredStatsLoading: boolean;
  fetchFilteredStats: (selection: ActiveSelection) => Promise<void>;
  clearFilteredStats: () => void;
}

// ---------------------------------------------------------------------------
// AbortController для in-flight запроса filtered stats
// Хранится вне Zustand state — не сериализуется, не триггерит ре-рендер
// ---------------------------------------------------------------------------

let _statsController: AbortController | null = null;

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useDashboardStore = create<DashboardStore>()(
  persist(
    (set, get) => ({
      activeSelection: null,

      setSelection: (sel) => {
        // Повторный клик по тому же элементу → сброс
        const cur = get().activeSelection;
        if (cur && cur.dimension === sel?.dimension && cur.value === sel?.value) {
          set({ activeSelection: null });
        } else {
          set({ activeSelection: sel });
        }
      },

      clearSelection: () => set({ activeSelection: null }),

      drawerDimension: null,
      openDrawer: (d) => set({ drawerDimension: d }),
      closeDrawer: () => set({ drawerDimension: null }),

      builderCards: [],
      addBuilderCard: (card) =>
        set((s) => ({ builderCards: [...s.builderCards, { ...card, id: crypto.randomUUID() }] })),
      removeBuilderCard: (id) =>
        set((s) => ({ builderCards: s.builderCards.filter((c) => c.id !== id) })),

      // ---- Cross-filter V2 ------------------------------------------------

      filteredStats: null,
      filteredStatsLoading: false,

      fetchFilteredStats: async (selection) => {
        // Неподдерживаемые измерения (journal, author) — сервер не фильтрует;
        // сбрасываем V2-state и оставляем V1 visual dimming.
        if (!selectionToParams(selection)) {
          _statsController?.abort();
          _statsController = null;
          set({ filteredStats: null, filteredStatsLoading: false });
          return;
        }

        // Отменяем предыдущий in-flight запрос (race condition при быстрых кликах)
        _statsController?.abort();
        const controller = new AbortController();
        _statsController = controller;

        set({ filteredStatsLoading: true });
        try {
          const data = await getFilteredStats(selection, controller.signal);
          // Игнорируем ответ если этот запрос уже был отменён
          if (!controller.signal.aborted) {
            set({ filteredStats: data, filteredStatsLoading: false });
          }
        } catch {
          if (!controller.signal.aborted) {
            set({ filteredStatsLoading: false });
          }
        }
      },

      clearFilteredStats: () => {
        _statsController?.abort();
        _statsController = null;
        set({ filteredStats: null, filteredStatsLoading: false });
      },
    }),
    {
      name: 'scopus-dashboard-v1',
      storage: createJSONStorage(() => localStorage),
      // Только builderCards персистируются — всё остальное сессионное
      partialize: (state) => ({ builderCards: state.builderCards }),
      version: 1,
      migrate: (_persisted, version) => {
        if (version < 1) return { builderCards: [] };
        return _persisted as { builderCards: BuilderCard[] };
      },
    }
  )
);
