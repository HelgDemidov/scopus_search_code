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
    setFilters: vi.fn(),
    fetchArticles: vi.fn().mockResolvedValue(undefined),
    setPage: vi.fn(),
    setSize: vi.fn(),
    setAppendMode: vi.fn(),
    searchScopusLive: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

// Мок useArticleStore — при каждом тесте создаём новый стейт
let articleState = makeArticleState();
vi.mock('../stores/articleStore', () => ({
  useArticleStore: (selector: (s: ReturnType<typeof makeArticleState>) => unknown) =>
    selector(articleState),
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
    // Заголовок hero-блока присутствует
    expect(screen.getByText(/Поиск публикаций Scopus/i)).toBeInTheDocument();
    // ArticleList появляется только после hasSearched=true
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
    // Триггерим поиск, чтобы hasSearched=true
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

    // Вызываем onPageChange напрямую из захваченных props
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
// Блок 4: Авторизованный режим — нейтральные заглушки пагинации
// ---------------------------------------------------------------------------

describe('HomePage — auth mode (pagination stubs)', () => {

  it('ArticleList получает page=1, size=25 независимо от стора', async () => {
    authIsAuthenticated = true;
    // page/size в сторе отличаются от ожидаемых заглушек
    articleState = makeArticleState({ page: 5, size: 50 as PageSize, total: 200 });
    render(<HomePage />);
    // В auth-режиме ArticleList виден сразу (нет условия hasSearched)
    expect(screen.getByTestId('article-list')).toBeInTheDocument();
    expect(capturedArticleListProps.page).toBe(1);
    expect(capturedArticleListProps.size).toBe(25);
  });

  it('ArticleList получает total=liveResults.length, appendMode=false', () => {
    authIsAuthenticated = true;
    articleState = makeArticleState({
      liveResults: [{ id: 1, title: 'X' }, { id: 2, title: 'Y' }] as never,
      total: 999,     // total стора игнорируется в auth-режиме
      appendMode: true, // appendMode стора тоже игнорируется
    });
    render(<HomePage />);
    expect(capturedArticleListProps.total).toBe(2); // liveResults.length
    expect(capturedArticleListProps.appendMode).toBe(false);
  });
});
