import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Dimension, ChartType } from '../components/charts/chartColors';

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
}

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
    }),
    {
      name: 'scopus-dashboard-v1',
      storage: createJSONStorage(() => localStorage),
      // Только builderCards персистируются — selection и drawer сессионные
      partialize: (state) => ({ builderCards: state.builderCards }),
      version: 1,
      migrate: (_persisted, version) => {
        // При изменении BuilderCard-схемы — инкрементировать version здесь
        if (version < 1) return { builderCards: [] };
        return _persisted as { builderCards: BuilderCard[] };
      },
    }
  )
);
