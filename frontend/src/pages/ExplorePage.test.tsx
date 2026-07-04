/**
 * ExplorePage — тесты cross-filter V2 useEffect:
 * activeSelection = null  → clearFilteredStats вызывается при рендере
 * activeSelection = {...} → fetchFilteredStats вызывается с правильным selection
 *
 * Все chart-компоненты заглушены — тест не проверяет их рендер,
 * только взаимодействие страницы с dashboardStore.
 */

import { render, act, screen } from '@testing-library/react';
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
  mockGetPersonalStats,
  getDashboardState,
  getIsAuthenticated,
  setIsAuthenticated,
  getUrlMode,
  setUrlMode,
} = vi.hoisted(() => {
  const mockClearFilteredStats = vi.fn();
  const mockFetchFilteredStats = vi.fn().mockResolvedValue(undefined);
  const mockFetchStats = vi.fn().mockResolvedValue(undefined);
  // По умолчанию — непустая личная статистика (total > 0), чтобы существующие
  // тесты personal mode не переопределяли это в каждом it()
  const mockGetPersonalStats = vi.fn().mockResolvedValue({
    total: 1,
    by_year: [],
    by_journal: [],
    by_country: [],
    by_doc_type: [],
    by_open_access: [],
  });

  let activeSelection: ActiveSelection | null = null;
  let isAuthenticated = false;
  let urlMode: string | null = null;

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

  return {
    mockClearFilteredStats,
    mockFetchFilteredStats,
    mockFetchStats,
    mockGetPersonalStats,
    getDashboardState,
    getIsAuthenticated: () => isAuthenticated,
    setIsAuthenticated: (v: boolean) => { isAuthenticated = v; },
    getUrlMode: () => urlMode,
    setUrlMode: (v: string | null) => { urlMode = v; },
  };
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
    selector({ isAuthenticated: getIsAuthenticated() }),
}));

// Personal mode теперь получает данные из GET /articles/stats/personal, а не
// из historyStore-селекторов (docs/personal-search-data/spec.md §4)
vi.mock('../api/articles', () => ({
  getPersonalStats: mockGetPersonalStats,
}));

vi.mock('react-router-dom', () => ({
  useSearchParams: () => {
    const params = new URLSearchParams();
    const mode = getUrlMode();
    if (mode) params.set('mode', mode);
    return [params, vi.fn()];
  },
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

// Заглушки explore-компонентов — рендерят testid-маркер (а не null), чтобы
// тесты ниже могли утверждать их присутствие/отсутствие в DOM
vi.mock('../components/explore/KpiRow', () => ({ KpiRow: () => <div data-testid="kpi-row" /> }));
vi.mock('../components/explore/DimensionDrawer', () => ({ DimensionDrawer: () => <div data-testid="dimension-drawer" /> }));
vi.mock('../components/explore/ActiveFilterBanner', () => ({ ActiveFilterBanner: () => null }));
vi.mock('../components/explore/ChartBuilderPanel', () => ({ ChartBuilderPanel: () => null }));

// Заглушки lazy-загружаемых chart-компонентов — тоже testid-маркеры:
// используются, чтобы проверить, что 6 стационарных чартов больше не
// рендерятся в collection mode (docs/explore-charts-refactor/spec.md §1),
// но 4 из них по-прежнему рендерятся в personal mode.
vi.mock('../components/charts/PublicationsByYearChart', () => ({ PublicationsByYearChart: () => <div data-testid="chart-year" /> }));
vi.mock('../components/charts/TopCountriesChart', () => ({ TopCountriesChart: () => <div data-testid="chart-country" /> }));
vi.mock('../components/charts/DocumentTypesChart', () => ({ DocumentTypesChart: () => <div data-testid="chart-doctype" /> }));
vi.mock('../components/charts/TopJournalsChart', () => ({ TopJournalsChart: () => <div data-testid="chart-journal" /> }));
vi.mock('../components/charts/DynamicChart', () => ({ DynamicChart: () => null }));

// ---------------------------------------------------------------------------
// setUp
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  // Сбрасываем activeSelection/auth/URL-mode перед каждым тестом
  (getDashboardState as { setActiveSelection?: (v: ActiveSelection | null) => void })
    .setActiveSelection?.(null);
  setIsAuthenticated(false);
  setUrlMode(null);
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

// ---------------------------------------------------------------------------
// Отключение 4 личных стационарных чартов в collection mode (spec.md §1;
// OpenAccessChart/TopAuthorsChart удалены целиком — были мёртвым кодом,
// см. docs/explore-cross-analytics/spec.md §1)
// ---------------------------------------------------------------------------

describe('ExplorePage — collection mode: личные стационарные чарты отключены', () => {
  it('ни один из 4 personal-mode чартов не рендерится', async () => {
    await act(async () => {
      render(<ExplorePage />);
    });

    expect(screen.queryByTestId('chart-year')).not.toBeInTheDocument();
    expect(screen.queryByTestId('chart-country')).not.toBeInTheDocument();
    expect(screen.queryByTestId('chart-doctype')).not.toBeInTheDocument();
    expect(screen.queryByTestId('chart-journal')).not.toBeInTheDocument();
  });

  it('KpiRow и DimensionDrawer по-прежнему рендерятся — они единственный путь к деталям', async () => {
    await act(async () => {
      render(<ExplorePage />);
    });

    expect(screen.getByTestId('kpi-row')).toBeInTheDocument();
    expect(screen.getByTestId('dimension-drawer')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Personal mode: реальная агрегация через GET /articles/stats/personal
// (docs/personal-search-data/spec.md §2/§4 — заменяет клиентские селекторы
// по фильтрам поиска)
// ---------------------------------------------------------------------------

describe('ExplorePage — personal mode', () => {
  beforeEach(() => {
    setIsAuthenticated(true);
    setUrlMode('personal');
  });

  it('вызывает getPersonalStats при входе в personal mode', async () => {
    await act(async () => {
      render(<ExplorePage />);
    });

    expect(mockGetPersonalStats).toHaveBeenCalledOnce();
  });

  it('4 личных чарта рендерятся (year/country/doctype/journal), когда total > 0', async () => {
    await act(async () => {
      render(<ExplorePage />);
    });

    expect(await screen.findByTestId('chart-year')).toBeInTheDocument();
    expect(await screen.findByTestId('chart-country')).toBeInTheDocument();
    expect(await screen.findByTestId('chart-doctype')).toBeInTheDocument();
    expect(await screen.findByTestId('chart-journal')).toBeInTheDocument();
  });

  it('KpiRow/DimensionDrawer не рендерятся в personal mode (нет cross-filter drawer для личной истории)', async () => {
    await act(async () => {
      render(<ExplorePage />);
    });
    await screen.findByTestId('chart-year');

    expect(screen.queryByTestId('kpi-row')).not.toBeInTheDocument();
    expect(screen.queryByTestId('dimension-drawer')).not.toBeInTheDocument();
  });

  it('total=0 → показывает emptyPersonal вместо чартов (ранее недостижимая ветка — баг найден и исправлен в §4)', async () => {
    mockGetPersonalStats.mockResolvedValueOnce({
      total: 0,
      by_year: [],
      by_journal: [],
      by_country: [],
      by_doc_type: [],
      by_open_access: [],
    });

    await act(async () => {
      render(<ExplorePage />);
    });

    expect(await screen.findByText(/No search history yet/)).toBeInTheDocument();
    expect(screen.queryByTestId('chart-year')).not.toBeInTheDocument();
  });

  it('ошибка getPersonalStats → показывает emptyPersonal, не падает', async () => {
    mockGetPersonalStats.mockRejectedValueOnce(new Error('network down'));

    await act(async () => {
      render(<ExplorePage />);
    });

    expect(await screen.findByText(/No search history yet/)).toBeInTheDocument();
  });
});
