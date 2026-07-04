/**
 * SearchHistoryList — первое тестовое покрытие компонента (docs/personal-search-data/spec.md §3).
 *
 * Покрывает и уже существовавшую (loading/empty/pagination/refresh), и новую
 * (expand/collapse полнодетального просмотра статей) функциональность —
 * до этого тикета у компонента не было ни одного теста.
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { SearchHistoryList } from './SearchHistoryList';
import type { SearchHistoryItem } from '../../types/api';

// ---------------------------------------------------------------------------
// Моки модулей
// ---------------------------------------------------------------------------

const { mockFetchHistory, mockGetSearchResults, getHistoryState, setHistoryState } = vi.hoisted(() => {
  const mockFetchHistory = vi.fn();
  const mockGetSearchResults = vi.fn();

  let state = { items: [] as unknown[], isLoading: false };

  return {
    mockFetchHistory,
    mockGetSearchResults,
    getHistoryState: () => state,
    setHistoryState: (v: typeof state) => { state = v; },
  };
});

vi.mock('../../stores/historyStore', () => ({
  useHistoryStore: () => ({ ...getHistoryState(), fetchHistory: mockFetchHistory }),
}));

vi.mock('../../api/articles', () => ({
  getSearchResults: mockGetSearchResults,
}));

// Заглушка lazy-компонента — тот же паттерн, что ExplorePage.test.tsx для чартов
vi.mock('./SearchResultsList', () => ({
  SearchResultsList: ({ articles }: { articles: unknown[] }) => (
    <div data-testid="search-results-list">{articles.length} article(s)</div>
  ),
}));

// ---------------------------------------------------------------------------
// Фикстуры
// ---------------------------------------------------------------------------

function makeItem(overrides: Partial<SearchHistoryItem> = {}): SearchHistoryItem {
  return {
    id: 1,
    query: 'neural networks',
    created_at: '2026-07-01T12:00:00Z',
    result_count: 5,
    filters: {},
    results_available: true,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  setHistoryState({ items: [], isLoading: false });
});

// ---------------------------------------------------------------------------
// Loading / empty
// ---------------------------------------------------------------------------

describe('SearchHistoryList — базовые состояния', () => {
  it('isLoading=true → показывает скелетоны, не список', () => {
    setHistoryState({ items: [], isLoading: true });
    const { container } = render(<SearchHistoryList />);

    expect(container.querySelectorAll('[class*="animate-pulse"]').length).toBeGreaterThan(0);
    expect(screen.queryByText('neural networks')).not.toBeInTheDocument();
  });

  it('items=[] → показывает пустое состояние', () => {
    setHistoryState({ items: [], isLoading: false });
    render(<SearchHistoryList />);

    expect(screen.getByText('No search history yet')).toBeInTheDocument();
  });

  it('клик на Refresh вызывает fetchHistory', async () => {
    const user = userEvent.setup();
    setHistoryState({ items: [makeItem()], isLoading: false });
    render(<SearchHistoryList />);

    await user.click(screen.getByRole('button', { name: 'Refresh search history' }));

    expect(mockFetchHistory).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// Рендер строк истории
// ---------------------------------------------------------------------------

describe('SearchHistoryList — рендер строк', () => {
  it('рендерит query, result count и бейдж Available', () => {
    setHistoryState({ items: [makeItem({ results_available: true, result_count: 5 })], isLoading: false });
    render(<SearchHistoryList />);

    expect(screen.getByText('neural networks')).toBeInTheDocument();
    expect(screen.getByText('5 results')).toBeInTheDocument();
    expect(screen.getByText('Available')).toBeInTheDocument();
  });

  it('results_available=false → бейдж No results, кнопка disabled', () => {
    setHistoryState({ items: [makeItem({ results_available: false })], isLoading: false });
    render(<SearchHistoryList />);

    expect(screen.getByText('No results')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /neural networks/ })).toBeDisabled();
  });

  it('пагинация: >10 записей показывает контролы, следующая страница работает', async () => {
    const user = userEvent.setup();
    const items = Array.from({ length: 15 }, (_, i) => makeItem({ id: i + 1, query: `q${i}` }));
    setHistoryState({ items, isLoading: false });
    render(<SearchHistoryList />);

    expect(screen.getByText('1 / 2')).toBeInTheDocument();
    expect(screen.getByText('q0')).toBeInTheDocument();
    expect(screen.queryByText('q10')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Next page' }));

    expect(screen.getByText('q10')).toBeInTheDocument();
    expect(screen.queryByText('q0')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Expand/collapse полнодетального просмотра (docs/personal-search-data/spec.md §3)
// ---------------------------------------------------------------------------

describe('SearchHistoryList — expand/collapse статей', () => {
  it('клик на строку с results_available=true → fetch по клику, не на монтировании', () => {
    setHistoryState({ items: [makeItem()], isLoading: false });
    render(<SearchHistoryList />);

    expect(mockGetSearchResults).not.toHaveBeenCalled();
  });

  it('раскрывает статьи после успешного fetch, aria-expanded переключается', async () => {
    const user = userEvent.setup();
    mockGetSearchResults.mockResolvedValueOnce({
      search_id: 1,
      query: 'neural networks',
      created_at: '2026-07-01T12:00:00Z',
      articles: [{ id: 1 }, { id: 2 }],
      total: 2,
    });
    setHistoryState({ items: [makeItem()], isLoading: false });
    render(<SearchHistoryList />);

    const trigger = screen.getByRole('button', { name: /neural networks/ });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await user.click(trigger);

    expect(mockGetSearchResults).toHaveBeenCalledWith(1);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(await screen.findByTestId('search-results-list')).toHaveTextContent('2 article(s)');
  });

  it('повторный клик сворачивает и НЕ рефетчит (кэш по searchId)', async () => {
    const user = userEvent.setup();
    mockGetSearchResults.mockResolvedValueOnce({
      search_id: 1, query: 'q', created_at: '2026-07-01T12:00:00Z', articles: [{ id: 1 }], total: 1,
    });
    setHistoryState({ items: [makeItem()], isLoading: false });
    render(<SearchHistoryList />);

    const trigger = screen.getByRole('button', { name: /neural networks/ });
    await user.click(trigger); // expand
    await screen.findByTestId('search-results-list');
    await user.click(trigger); // collapse

    expect(screen.queryByTestId('search-results-list')).not.toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await user.click(trigger); // expand снова

    expect(await screen.findByTestId('search-results-list')).toBeInTheDocument();
    expect(mockGetSearchResults).toHaveBeenCalledOnce(); // не вызван повторно
  });

  it('клик на disabled-строку (results_available=false) не вызывает fetch', async () => {
    const user = userEvent.setup();
    setHistoryState({ items: [makeItem({ results_available: false })], isLoading: false });
    render(<SearchHistoryList />);

    await user.click(screen.getByRole('button', { name: /neural networks/ }));

    expect(mockGetSearchResults).not.toHaveBeenCalled();
  });

  it('ошибка fetch → показывает сообщение об ошибке, не падает', async () => {
    const user = userEvent.setup();
    mockGetSearchResults.mockRejectedValueOnce(new Error('network down'));
    setHistoryState({ items: [makeItem()], isLoading: false });
    render(<SearchHistoryList />);

    await user.click(screen.getByRole('button', { name: /neural networks/ }));

    expect(await screen.findByText('Failed to load articles')).toBeInTheDocument();
  });

  it('раскрытая строка имеет aria-controls, указывающий на существующий регион', async () => {
    const user = userEvent.setup();
    mockGetSearchResults.mockResolvedValueOnce({
      search_id: 1, query: 'q', created_at: '2026-07-01T12:00:00Z', articles: [], total: 0,
    });
    setHistoryState({ items: [makeItem()], isLoading: false });
    const { container } = render(<SearchHistoryList />);

    const trigger = screen.getByRole('button', { name: /neural networks/ });
    await user.click(trigger);
    await screen.findByTestId('search-results-list');

    const controlsId = trigger.getAttribute('aria-controls');
    expect(controlsId).toBeTruthy();
    expect(container.querySelector(`#${controlsId}`)).not.toBeNull();
  });

  it('переключение на другую строку сворачивает первую (только один регион раскрыт)', async () => {
    const user = userEvent.setup();
    mockGetSearchResults.mockResolvedValue({
      search_id: 1, query: 'q', created_at: '2026-07-01T12:00:00Z', articles: [{ id: 1 }], total: 1,
    });
    setHistoryState({
      items: [makeItem({ id: 1, query: 'first' }), makeItem({ id: 2, query: 'second' })],
      isLoading: false,
    });
    render(<SearchHistoryList />);

    await user.click(screen.getByRole('button', { name: /first/ }));
    await screen.findByTestId('search-results-list');

    await user.click(screen.getByRole('button', { name: /second/ }));

    expect(screen.getByRole('button', { name: /first/ })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: /second/ })).toHaveAttribute('aria-expanded', 'true');
  });
});
