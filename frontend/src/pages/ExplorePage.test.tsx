/**
 * ExplorePage — тесты cross-filter V2 useEffect:
 * activeSelection = null  → clearFilteredStats вызывается при рендере
 * activeSelection = {...} → fetchFilteredStats вызывается с правильным selection
 *
 * Все chart-компоненты заглушены — тест не проверяет их рендер,
 * только взаимодействие страницы с dashboardStore.
 */

import { render, act, screen } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import ExplorePage from './ExplorePage';
import type { ActiveSelection } from '../stores/dashboardStore';

// ---------------------------------------------------------------------------
// Мутируемое состояние (vi.hoisted гарантирует видимость до vi.mock)
// ---------------------------------------------------------------------------

const {
  mockClearFilteredStats,
  mockFetchFilteredStats,
  mockFetchStats,
  mockCloseDrawer,
  mockGetPersonalStats,
  mockGetPersonalActivity,
  mockGetSearchHistory,
  getDashboardState,
  getIsAuthenticated,
  setIsAuthenticated,
  getUrlMode,
  setUrlMode,
} = vi.hoisted(() => {
  const mockClearFilteredStats = vi.fn();
  const mockFetchFilteredStats = vi.fn().mockResolvedValue(undefined);
  const mockFetchStats = vi.fn().mockResolvedValue(undefined);
  const mockCloseDrawer = vi.fn();
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
  const mockGetPersonalActivity = vi.fn().mockResolvedValue({
    granularity: 'week',
    buckets: [],
  });
  const mockGetSearchHistory = vi.fn().mockResolvedValue([]);

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
      closeDrawer: mockCloseDrawer,
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
    mockCloseDrawer,
    mockGetPersonalStats,
    mockGetPersonalActivity,
    mockGetSearchHistory,
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
  getPersonalActivity: mockGetPersonalActivity,
  getSearchHistory: mockGetSearchHistory,
}));

vi.mock('react-router-dom', () => ({
  useSearchParams: () => {
    const params = new URLSearchParams();
    const mode = getUrlMode();
    if (mode) params.set('mode', mode);
    return [params, vi.fn()];
  },
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
  // LocalizedLink (внутри ExplorePage — CTA-баннер/emptyPersonal) читает :lang
  // через useParams; пустой объект — фоллбэк на DEFAULT_URL_LANG.
  useParams: () => ({}),
}));

// useHreflangTags рендерит <Helmet> — требует HelmetProvider в дереве; SEO-теги
// не относятся к тому, что тестирует этот файл (см. useHreflangTags.test.tsx), заглушка
vi.mock('react-helmet-async', () => ({ Helmet: () => null }));

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
vi.mock('../components/explore/PersonalKpiRow', () => ({ PersonalKpiRow: () => <div data-testid="personal-kpi-row" /> }));
vi.mock('../components/explore/DimensionDrawer', () => ({
  DimensionDrawer: () => <div data-testid="dimension-drawer" />,
  PersonalDimensionDrawer: () => <div data-testid="personal-dimension-drawer" />,
}));
vi.mock('../components/explore/ActiveFilterBanner', () => ({ ActiveFilterBanner: () => null }));
vi.mock('../components/explore/PersonalActivityChart', () => ({
  PersonalActivityChart: () => <div data-testid="personal-activity-chart" />,
}));
vi.mock('../components/explore/FilterFingerprintStrip', () => ({
  FilterFingerprintStrip: () => <div data-testid="filter-fingerprint-strip" />,
}));
vi.mock('../components/explore/ChartBuilderPanel', () => ({ ChartBuilderPanel: () => null }));

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
// Collection mode: KpiRow/DimensionDrawer (не Personal*) — единственный путь
// к деталям (docs/explore-personal-redesign/spec.md §1; старые 4 personal-only
// чарта и OpenAccessChart/TopAuthorsChart удалены целиком, были мёртвым кодом)
// ---------------------------------------------------------------------------

describe('ExplorePage — collection mode: KpiRow/DimensionDrawer, не Personal*', () => {
  it('KpiRow и DimensionDrawer рендерятся — они единственный путь к деталям', async () => {
    await act(async () => {
      render(<ExplorePage />);
    });

    expect(screen.getByTestId('kpi-row')).toBeInTheDocument();
    expect(screen.getByTestId('dimension-drawer')).toBeInTheDocument();
  });

  it('personal-scoped варианты не рендерятся в collection mode', async () => {
    await act(async () => {
      render(<ExplorePage />);
    });

    expect(screen.queryByTestId('personal-kpi-row')).not.toBeInTheDocument();
    expect(screen.queryByTestId('personal-dimension-drawer')).not.toBeInTheDocument();
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

  it('вызывает getPersonalStats/getPersonalActivity/getSearchHistory при входе в personal mode', async () => {
    await act(async () => {
      render(<ExplorePage />);
    });

    expect(mockGetPersonalStats).toHaveBeenCalledOnce();
    expect(mockGetPersonalActivity).toHaveBeenCalledOnce();
    expect(mockGetSearchHistory).toHaveBeenCalledWith(15);
  });

  it('PersonalKpiRow/PersonalDimensionDrawer/PersonalActivityChart/FilterFingerprintStrip рендерятся, когда total > 0 (docs/explore-personal-redesign/spec.md §1-2)', async () => {
    await act(async () => {
      render(<ExplorePage />);
    });

    expect(await screen.findByTestId('personal-kpi-row')).toBeInTheDocument();
    expect(await screen.findByTestId('personal-dimension-drawer')).toBeInTheDocument();
    expect(await screen.findByTestId('personal-activity-chart')).toBeInTheDocument();
    expect(await screen.findByTestId('filter-fingerprint-strip')).toBeInTheDocument();
  });

  it('collection-scoped KpiRow/DimensionDrawer не рендерятся в personal mode', async () => {
    await act(async () => {
      render(<ExplorePage />);
    });
    await screen.findByTestId('personal-kpi-row');

    expect(screen.queryByTestId('kpi-row')).not.toBeInTheDocument();
    expect(screen.queryByTestId('dimension-drawer')).not.toBeInTheDocument();
  });

  it('total=0 → показывает emptyPersonal вместо KPI/drawer (ранее недостижимая ветка — баг найден и исправлен в §4)', async () => {
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
    expect(screen.queryByTestId('personal-kpi-row')).not.toBeInTheDocument();
    expect(screen.queryByTestId('personal-activity-chart')).not.toBeInTheDocument();
    expect(screen.queryByTestId('filter-fingerprint-strip')).not.toBeInTheDocument();
  });

  it('ошибка getPersonalStats → показывает emptyPersonal, не падает', async () => {
    mockGetPersonalStats.mockRejectedValueOnce(new Error('network down'));

    await act(async () => {
      render(<ExplorePage />);
    });

    expect(await screen.findByText(/No search history yet/)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Единый Sheet-instance между режимами (docs/explore-personal-redesign/spec.md
// §1.2 п.5) — при смене mode drawer обязан закрываться, иначе может остаться
// открытым с "залипшим" измерением от предыдущего режима.
// ---------------------------------------------------------------------------

describe('ExplorePage — единый drawer между режимами', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('переключение mode вызывает closeDrawer', async () => {
    // Дополнительный await act(async () => {}) ниже даёт время резолвиться lazy-
    // импорту стационарных collection-чартов (TopCountriesByYearChart и т.п.,
    // не замоканы в этом файле) — им нужен window.matchMedia (useMediaQuery),
    // которого нет в jsdom по умолчанию.
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }));

    setIsAuthenticated(true);
    const { rerender } = render(<ExplorePage />);
    await act(async () => {});

    mockCloseDrawer.mockClear();
    setUrlMode('personal');
    rerender(<ExplorePage />);

    expect(mockCloseDrawer).toHaveBeenCalled();
  });
});
