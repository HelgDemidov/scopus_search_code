import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, beforeEach, describe, it, expect } from 'vitest';
import HomePage from './HomePage';
import type { PageSize } from '../components/articles/PaginationBar';

// ---------------------------------------------------------------------------
// Моки модулей — объявляем ДО импорта тестируемого модуля
// ---------------------------------------------------------------------------

// Захват props ArticleList — каждый рендер перезаписывает объект
let capturedArticleListProps: Record<string, unknown> = {};
vi.mock('../components/articles/ArticleList', () => ({
  ArticleList: (props: Record<string, unknown>) => {
    capturedArticleListProps = props;
    return <div data-testid="article-list" />;
  },
}));

// Захват props ScopusPaginationBar — каждый рендер перезаписывает объект
let capturedScopusPaginationBarProps: Record<string, unknown> = {};
vi.mock('../components/articles/ScopusPaginationBar', () => ({
  ScopusPaginationBar: (props: Record<string, unknown>) => {
    capturedScopusPaginationBarProps = props;
    return <div data-testid="scopus-pagination-bar" />;
  },
}));

// Заглушки компонентов без логики, нужных HomePage
vi.mock('../components/search/SearchBar', () => ({
  SearchBar: ({ onSearch }: { onSearch: (q: string) => void }) => (
    <button data-testid="search-bar" onClick={() => onSearch('ai')}>search</button>
  ),
}));
vi.mock('../components/articles/ScopusQuotaBadge', () => ({
  ScopusQuotaBadge: () => <div data-testid="quota-badge" />,
}));
vi.mock('../components/search/SearchResultsDashboard', () => ({
  SearchResultsDashboard: () => <div data-testid="results-dashboard" />,
}));

// react-router-dom: Link используется в AnonHero — заглушаем, чтобы не нужен был Router
vi.mock('react-router-dom', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

// sonner: toast используется в useEffect — заглушаем, чтобы не падало без Provider
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

// getSearchStats: fire-and-forget вызов — возвращаем валидный объект
vi.mock('../api/articles', () => ({
  getSearchStats: vi.fn().mockResolvedValue({ total: 0, by_year: [], by_type: [], by_country: [], by_journal: [] }),
  getArticles: vi.fn().mockResolvedValue({ articles: [], total: 0 }),
  findArticles: vi.fn().mockResolvedValue({ articles: [], quota: null }),
}));

// ---------------------------------------------------------------------------
// Фабрики для articleStore / authStore
// ---------------------------------------------------------------------------

// Дефолтный articleStore-стейт — все поля, которые читает HomePage
function makeArticleState(overrides: Record<string, unknown> = {}) {
  return {
    articles: [],
    liveResults: [],
    isLoading: false,
    isLiveSearching: false,
    error: null,
    filters: {},
    page: 1,
    size: 10 as PageSize,
    total: 0,
    appendMode: false,
    // Поля авторизованной Scopus-пагинации
    liveSize: 10 as 10 | 'all',
    setFilters: vi.fn(),
    fetchArticles: vi.fn().mockResolvedValue(undefined),
    setPage: vi.fn(),
    setSize: vi.fn(),
    setAppendMode: vi.fn(),
    searchScopusLive: vi.fn().mockResolvedValue(undefined),
    setLiveSize: vi.fn(),
    ...overrides,
  };
}

// Мок useArticleStore — при каждом тесте создаём новый стейт.
// selector опционален: HomePage вызывает useArticleStore() без аргумента
// (деструктурирует весь стор), поэтому при selector === undefined возвращаем
// весь articleState, иначе — selector(articleState).
let articleState = makeArticleState();
vi.mock('../stores/articleStore', () => ({
  useArticleStore: (selector?: (s: ReturnType<typeof makeArticleState>) => unknown) =>
    selector ? selector(articleState) : articleState,
}));

// Мок useAuthStore — переключается через authState
let authIsAuthenticated = false;
vi.mock('../stores/authStore', () => ({
  useAuthStore: (selector: (s: { isAuthenticated: boolean }) => unknown) =>
    selector({ isAuthenticated: authIsAuthenticated }),
}));

// ---------------------------------------------------------------------------
// setUp
// ---------------------------------------------------------------------------

beforeEach(() => {
  capturedArticleListProps = {};
  capturedScopusPaginationBarProps = {};
  authIsAuthenticated = false;
  articleState = makeArticleState();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Блок 1: Anon hero — рендер до / после поиска
// ---------------------------------------------------------------------------

describe('HomePage — anon hero', () => {

  it('до поиска: AnonHero виден, ArticleList не рендерится', () => {
    render(<HomePage />);
    expect(screen.getByText(/Search Scopus Publications/i)).toBeInTheDocument();
    expect(screen.queryByTestId('article-list')).toBeNull();
  });

  it('после поиска: ArticleList появляется', async () => {
    render(<HomePage />);
    await userEvent.click(screen.getByTestId('search-bar'));
    expect(screen.getByTestId('article-list')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Блок 2: Pagination wire-up — анонимный режим
// ---------------------------------------------------------------------------

describe('HomePage — pagination wire-up (anon)', () => {

  it('page/size/total/appendMode из стора прокидываются в ArticleList', async () => {
    articleState = makeArticleState({ page: 3, size: 25 as PageSize, total: 75, appendMode: true });
    render(<HomePage />);
    await userEvent.click(screen.getByTestId('search-bar'));
    expect(capturedArticleListProps.page).toBe(3);
    expect(capturedArticleListProps.size).toBe(25);
    expect(capturedArticleListProps.total).toBe(75);
    expect(capturedArticleListProps.appendMode).toBe(true);
  });

  it('handlePageChange вызывает setPage(p) и fetchArticles()', async () => {
    const setPage = vi.fn();
    const fetchArticles = vi.fn().mockResolvedValue(undefined);
    articleState = makeArticleState({ total: 30, setPage, fetchArticles });
    render(<HomePage />);
    await userEvent.click(screen.getByTestId('search-bar'));

    await act(async () => {
      (capturedArticleListProps.onPageChange as (p: number) => void)(2);
    });
    expect(setPage).toHaveBeenCalledWith(2);
    expect(fetchArticles).toHaveBeenCalled();
  });

  it('handleSizeChange вызывает setSize(s) и fetchArticles()', async () => {
    const setSize = vi.fn();
    const fetchArticles = vi.fn().mockResolvedValue(undefined);
    articleState = makeArticleState({ total: 30, setSize, fetchArticles });
    render(<HomePage />);
    await userEvent.click(screen.getByTestId('search-bar'));

    await act(async () => {
      (capturedArticleListProps.onSizeChange as (s: number) => void)(25);
    });
    expect(setSize).toHaveBeenCalledWith(25);
    expect(fetchArticles).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Блок 3: Toggle mode
// ---------------------------------------------------------------------------

describe('HomePage — toggle mode', () => {

  it('onToggleMode при appendMode=false вызывает setAppendMode(true)', async () => {
    const setAppendMode = vi.fn();
    articleState = makeArticleState({ appendMode: false, total: 10, setAppendMode });
    render(<HomePage />);
    await userEvent.click(screen.getByTestId('search-bar'));

    await act(async () => {
      (capturedArticleListProps.onToggleMode as () => void)();
    });
    expect(setAppendMode).toHaveBeenCalledWith(true);
  });

  it('onToggleMode при appendMode=true вызывает setAppendMode(false)', async () => {
    const setAppendMode = vi.fn();
    articleState = makeArticleState({ appendMode: true, total: 10, setAppendMode });
    render(<HomePage />);
    await userEvent.click(screen.getByTestId('search-bar'));

    await act(async () => {
      (capturedArticleListProps.onToggleMode as () => void)();
    });
    expect(setAppendMode).toHaveBeenCalledWith(false);
  });
});

// ---------------------------------------------------------------------------
// Блок 4: Auth mode — ScopusPaginationBar wire-up
// ---------------------------------------------------------------------------

describe('HomePage — auth mode (ScopusPaginationBar wire-up)', () => {

  it('ScopusPaginationBar рендерится в auth-режиме (searchMode=scopus по дефолту)', () => {
    authIsAuthenticated = true;
    render(<HomePage />);
    expect(screen.getByTestId('scopus-pagination-bar')).toBeInTheDocument();
  });

  it('total в ScopusPaginationBar = sortedLiveArticles.length (liveResults.length)', () => {
    authIsAuthenticated = true;
    const liveResults = [
      { id: 1, title: 'A', cited_by_count: 5 },
      { id: 2, title: 'B', cited_by_count: 1 },
      { id: 3, title: 'C', cited_by_count: 3 },
    ] as never;
    articleState = makeArticleState({ liveResults });
    render(<HomePage />);
    expect(capturedScopusPaginationBarProps.total).toBe(3);
  });

  it('livePage сбрасывается в 1 при новом поиске', async () => {
    authIsAuthenticated = true;
    render(<HomePage />);

    await act(async () => {
      (capturedScopusPaginationBarProps.onPageChange as (p: number) => void)(2);
    });
    expect(capturedScopusPaginationBarProps.livePage).toBe(2);

    await act(async () => {
      await userEvent.click(screen.getByTestId('search-bar'));
    });
    expect(capturedScopusPaginationBarProps.livePage).toBe(1);
  });

  it('onSizeChange вызывает setLiveSize и сбрасывает livePage в 1', async () => {
    authIsAuthenticated = true;
    const setLiveSize = vi.fn();
    articleState = makeArticleState({ setLiveSize });
    render(<HomePage />);

    await act(async () => {
      (capturedScopusPaginationBarProps.onPageChange as (p: number) => void)(2);
    });
    expect(capturedScopusPaginationBarProps.livePage).toBe(2);

    await act(async () => {
      (capturedScopusPaginationBarProps.onSizeChange as (s: 'all') => void)('all');
    });
    expect(setLiveSize).toHaveBeenCalledWith('all');
    expect(capturedScopusPaginationBarProps.livePage).toBe(1);
  });

  it('ArticleList получает срез [0..9] при liveSize=10, livePage=1, total=15', () => {
    authIsAuthenticated = true;
    const liveResults = Array.from({ length: 15 }, (_, i) => ({
      id: i + 1,
      title: `Article ${i + 1}`,
      cited_by_count: 0,
    })) as never;
    articleState = makeArticleState({ liveResults, liveSize: 10 as const });
    render(<HomePage />);

    const articles = capturedArticleListProps.articles as Array<{ id: number }>;
    expect(articles).toHaveLength(10);
    expect(articles[0].id).toBe(1);
    expect(articles[9].id).toBe(10);
  });

  it('при liveSize="all" ArticleList получает весь sortedLiveArticles', () => {
    authIsAuthenticated = true;
    const liveResults = Array.from({ length: 15 }, (_, i) => ({
      id: i + 1,
      title: `Article ${i + 1}`,
      cited_by_count: 0,
    })) as never;
    articleState = makeArticleState({ liveResults, liveSize: 'all' as const });
    render(<HomePage />);

    const articles = capturedArticleListProps.articles as Array<{ id: number }>;
    expect(articles).toHaveLength(15);
  });
});

// ---------------------------------------------------------------------------
// Блок 5: Auth mode — нейтральные заглушки ArticleList
// ---------------------------------------------------------------------------

describe('HomePage — auth mode (ArticleList neutral stubs)', () => {

  it('ArticleList получает appendMode=false и page=1 независимо от стора', () => {
    authIsAuthenticated = true;
    articleState = makeArticleState({ page: 5, size: 50 as PageSize, total: 200, appendMode: true });
    render(<HomePage />);
    expect(capturedArticleListProps.appendMode).toBe(false);
    expect(capturedArticleListProps.page).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Блок 6: Auth mode — searchMode toggle
// ---------------------------------------------------------------------------

describe('HomePage — auth mode (searchMode toggle)', () => {

  it('обе кнопки переключателя рендерятся: Scopus active, Catalog inactive', () => {
    authIsAuthenticated = true;
    render(<HomePage />);
    const scopusBtn = screen.getByRole('button', { name: /Search Scopus Database/i });
    const catalogBtn = screen.getByRole('button', { name: /Search AI.*Collection/i });
    // Дефолт — Scopus активен
    expect(scopusBtn).toHaveAttribute('aria-pressed', 'true');
    expect(catalogBtn).toHaveAttribute('aria-pressed', 'false');
  });

  it('клик на "Search AI & Neural Network Technologies Collection" меняет aria-pressed', async () => {
    authIsAuthenticated = true;
    render(<HomePage />);
    await userEvent.click(screen.getByRole('button', { name: /Search AI.*Collection/i }));
    expect(screen.getByRole('button', { name: /Search AI.*Collection/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /Search Scopus Database/i })).toHaveAttribute('aria-pressed', 'false');
  });

  it('в catalog-режиме handleSearch вызывает setFilters+fetchArticles, не searchScopusLive', async () => {
    authIsAuthenticated = true;
    const setFilters = vi.fn();
    const fetchArticles = vi.fn().mockResolvedValue(undefined);
    const searchScopusLive = vi.fn().mockResolvedValue(undefined);
    articleState = makeArticleState({ setFilters, fetchArticles, searchScopusLive });
    render(<HomePage />);

    // Переключаемся в catalog
    await userEvent.click(screen.getByRole('button', { name: /Search AI.*Collection/i }));
    // Запускаем поиск
    await act(async () => {
      await userEvent.click(screen.getByTestId('search-bar'));
    });

    expect(setFilters).toHaveBeenCalledWith({ search: 'ai', keyword: undefined });
    expect(fetchArticles).toHaveBeenCalled();
    expect(searchScopusLive).not.toHaveBeenCalled();
  });

  it('в catalog-режиме ArticleList получает page/size/total из стора', async () => {
    authIsAuthenticated = true;
    articleState = makeArticleState({
      page: 2,
      size: 25 as PageSize,
      total: 50,
      appendMode: false,
    });
    render(<HomePage />);

    await userEvent.click(screen.getByRole('button', { name: /Search AI.*Collection/i }));

    expect(capturedArticleListProps.page).toBe(2);
    expect(capturedArticleListProps.size).toBe(25);
    expect(capturedArticleListProps.total).toBe(50);
  });

  it('в catalog-режиме ScopusPaginationBar не рендерится', async () => {
    authIsAuthenticated = true;
    render(<HomePage />);
    await userEvent.click(screen.getByRole('button', { name: /Search AI.*Collection/i }));
    expect(screen.queryByTestId('scopus-pagination-bar')).toBeNull();
  });
});
