/**
 * ExplorePage — тесты cross-filter V2 useEffect:
 * activeSelection = null  → clearFilteredStats вызывается при рендере
 * activeSelection = {...} → fetchFilteredStats вызывается с правильным selection
 *
 * Все chart-компоненты заглушены — тест не проверяет их рендер,
 * только взаимодействие страницы с dashboardStore.
 */

import { render, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import ExplorePage from './ExplorePage';
import type { ActiveSelection } from '../stores/dashboardStore';

// ---------------------------------------------------------------------------
// Мутируемое состояние (vi.hoisted гарантирует видимость до vi.mock)
// ---------------------------------------------------------------------------

const {
  mockClearFilteredStats,
  mockFetchFilteredStats,
  mockFetchStats,
  mockFetchHistory,
  getDashboardState,
} = vi.hoisted(() => {
  const mockClearFilteredStats = vi.fn();
  const mockFetchFilteredStats = vi.fn().mockResolvedValue(undefined);
  const mockFetchStats = vi.fn().mockResolvedValue(undefined);
  const mockFetchHistory = vi.fn().mockResolvedValue(undefined);

  let activeSelection: ActiveSelection | null = null;

  function getDashboardState() {
    return {
      activeSelection,
      filteredStats: null,
      filteredStatsLoading: false,
      builderCards: [],
      drawerDimension: null,
      clearFilteredStats: mockClearFilteredStats,
      fetchFilteredStats: mockFetchFilteredStats,
      removeBuilderCard: vi.fn(),
      setActiveSelection: vi.fn(),
    };
  }

  // Экспортируем сеттер чтобы тесты могли менять activeSelection
  (getDashboardState as { setActiveSelection?: (v: ActiveSelection | null) => void }).setActiveSelection =
    (v: ActiveSelection | null) => { activeSelection = v; };

  return { mockClearFilteredStats, mockFetchFilteredStats, mockFetchStats, mockFetchHistory, getDashboardState };
});

// ---------------------------------------------------------------------------
// Моки модулей
// ---------------------------------------------------------------------------

vi.mock('../stores/dashboardStore', () => ({
  useDashboardStore: (selector?: (s: ReturnType<typeof getDashboardState>) => unknown) => {
    const state = getDashboardState();
    return selector ? selector(state) : state;
  },
}));

vi.mock('../stores/statsStore', () => ({
  useStatsStore: vi.fn((selector?: (s: unknown) => unknown) => {
    const state = { stats: null, isLoading: false, fetchStats: mockFetchStats };
    return selector ? selector(state) : state;
  }),
}));

vi.mock('../stores/authStore', () => ({
  useAuthStore: (selector: (s: { isAuthenticated: boolean }) => unknown) =>
    selector({ isAuthenticated: false }),
}));

vi.mock('../stores/historyStore', () => ({
  useHistoryStore: (selector?: (s: unknown) => unknown) => {
    const state = { items: [], isLoading: false, fetchHistory: mockFetchHistory };
    return selector ? selector(state) : state;
  },
  selectByYear: vi.fn(() => []),
  selectByDocType: vi.fn(() => []),
  selectByCountry: vi.fn(() => []),
  selectByJournal: vi.fn(() => []),
}));

vi.mock('react-router-dom', () => ({
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
}));

// shadcn/ui компоненты — используют @/lib/utils alias, который в jsdom не разрешается
vi.mock('../components/ui/skeleton', () => ({ Skeleton: () => null }));
vi.mock('../components/ui/button', () => ({
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
}));
vi.mock('../components/ui/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Заглушки explore-компонентов
vi.mock('../components/explore/KpiRow', () => ({ KpiRow: () => <div data-testid="kpi-row" /> }));
vi.mock('../components/explore/DimensionDrawer', () => ({ DimensionDrawer: () => null }));
vi.mock('../components/explore/ActiveFilterBanner', () => ({ ActiveFilterBanner: () => null }));
vi.mock('../components/explore/ChartBuilderPanel', () => ({ ChartBuilderPanel: () => null }));

// Заглушки lazy-загружаемых chart-компонентов
vi.mock('../components/charts/PublicationsByYearChart', () => ({ PublicationsByYearChart: () => null }));
vi.mock('../components/charts/TopCountriesChart', () => ({ TopCountriesChart: () => null }));
vi.mock('../components/charts/DocumentTypesChart', () => ({ DocumentTypesChart: () => null }));
vi.mock('../components/charts/TopJournalsChart', () => ({ TopJournalsChart: () => null }));
vi.mock('../components/charts/OpenAccessChart', () => ({ OpenAccessChart: () => null }));
vi.mock('../components/charts/TopAuthorsChart', () => ({ TopAuthorsChart: () => null }));
vi.mock('../components/charts/DynamicChart', () => ({ DynamicChart: () => null }));

// ---------------------------------------------------------------------------
// setUp
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  // Сбрасываем activeSelection в null перед каждым тестом
  (getDashboardState as { setActiveSelection?: (v: ActiveSelection | null) => void })
    .setActiveSelection?.(null);
});

// ---------------------------------------------------------------------------
// Тесты cross-filter V2 useEffect
// ---------------------------------------------------------------------------

describe('ExplorePage — cross-filter V2 useEffect', () => {
  it('activeSelection = null → clearFilteredStats вызывается при монтировании', async () => {
    // activeSelection уже null (сброшен в beforeEach)
    await act(async () => {
      render(<ExplorePage />);
    });

    expect(mockClearFilteredStats).toHaveBeenCalledOnce();
    expect(mockFetchFilteredStats).not.toHaveBeenCalled();
  });

  it('activeSelection ≠ null → fetchFilteredStats вызывается с правильным selection', async () => {
    const sel: ActiveSelection = { dimension: 'country', value: 'China' };
    (getDashboardState as { setActiveSelection?: (v: ActiveSelection | null) => void })
      .setActiveSelection?.(sel);

    await act(async () => {
      render(<ExplorePage />);
    });

    expect(mockFetchFilteredStats).toHaveBeenCalledOnce();
    expect(mockFetchFilteredStats).toHaveBeenCalledWith(sel);
    expect(mockClearFilteredStats).not.toHaveBeenCalled();
  });
});
