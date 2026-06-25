import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import type { SearchHistoryItem } from '../types/api';

// ---------------------------------------------------------------------------
// Моки модулей — объявляем ДО первого импорта стора
// ---------------------------------------------------------------------------

vi.mock('../api/articles', () => ({
  getSearchHistory: vi.fn(),
  getArticles: vi.fn(),
  findArticles: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Импорты после vi.mock
// ---------------------------------------------------------------------------

import { useHistoryStore } from './historyStore';
import { getSearchHistory } from '../api/articles';

const mockedGetSearchHistory = vi.mocked(getSearchHistory);

// ---------------------------------------------------------------------------
// Начальное состояние для сброса
// ---------------------------------------------------------------------------

const INITIAL_STATE = {
  items: [] as SearchHistoryItem[],
  isLoading: false,
  error: null as string | null,
  historyFilters: {},
};

beforeEach(() => {
  useHistoryStore.setState(INITIAL_STATE);
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Вспомогательные данные
// ---------------------------------------------------------------------------

// Фабрика минимального SearchHistoryItem — все обязательные поля из api.ts
function makeHistoryItem(id: number): SearchHistoryItem {
  return {
    id,
    query: `query_${id}`,
    filters: {},
    created_at: '2024-01-01T00:00:00Z',
    result_count: 0,
    results_available: false,
  };
}

// ---------------------------------------------------------------------------
// Блок: fetchHistory
// ---------------------------------------------------------------------------

describe('fetchHistory', () => {
  it('success: items заполняются, isLoading=false, error=null', async () => {
    const incoming = [makeHistoryItem(1), makeHistoryItem(2)];
    mockedGetSearchHistory.mockResolvedValueOnce(incoming);

    await act(async () => {
      await useHistoryStore.getState().fetchHistory();
    });

    const { items, isLoading, error } = useHistoryStore.getState();
    expect(items).toHaveLength(2);
    expect(items[0].id).toBe(1);
    expect(items[1].id).toBe(2);
    expect(isLoading).toBe(false);
    expect(error).toBeNull();
  });

  it('empty: items=[], isLoading=false, error=null', async () => {
    mockedGetSearchHistory.mockResolvedValueOnce([]);

    await act(async () => {
      await useHistoryStore.getState().fetchHistory();
    });

    const { items, isLoading, error } = useHistoryStore.getState();
    expect(items).toHaveLength(0);
    expect(isLoading).toBe(false);
    expect(error).toBeNull();
  });

  it('error: error заполняется, items=[], isLoading=false', async () => {
    mockedGetSearchHistory.mockRejectedValueOnce(new Error('Network error'));

    await act(async () => {
      await useHistoryStore.getState().fetchHistory();
    });

    const { items, isLoading, error } = useHistoryStore.getState();
    expect(error).toBe('Network error');
    expect(items).toHaveLength(0);
    expect(isLoading).toBe(false);
  });

  it('isLoading=true во время запроса, false после завершения', async () => {
    let loadingDuringFetch = false;

    mockedGetSearchHistory.mockImplementationOnce(() => {
      loadingDuringFetch = useHistoryStore.getState().isLoading;
      return Promise.resolve([]);
    });

    await act(async () => {
      await useHistoryStore.getState().fetchHistory();
    });

    expect(loadingDuringFetch).toBe(true);
    expect(useHistoryStore.getState().isLoading).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Блок: setHistoryFilters
// ---------------------------------------------------------------------------

describe('setHistoryFilters', () => {
  it('мержит частичное обновление, не затирает незатронутые поля', () => {
    // ArticleClientFilters использует camelCase — yearFrom, yearTo (не snake_case)
    useHistoryStore.setState({
      historyFilters: { yearFrom: 2020 },
    });

    act(() => {
      useHistoryStore.getState().setHistoryFilters({ yearTo: 2024 });
    });

    const { historyFilters } = useHistoryStore.getState();
    expect(historyFilters.yearFrom).toBe(2020);
    expect(historyFilters.yearTo).toBe(2024);
  });
});

// ---------------------------------------------------------------------------
// Блок: resetFilters
// ---------------------------------------------------------------------------

describe('resetFilters', () => {
  it('очищает все активные фильтры — historyFilters становится {}', () => {
    useHistoryStore.setState({
      historyFilters: {
        yearFrom: 2020,
        yearTo: 2024,
        docTypes: ['Article'],
        openAccessOnly: true,
        countries: ['Russia'],
      },
    });

    act(() => {
      useHistoryStore.getState().resetFilters();
    });

    expect(useHistoryStore.getState().historyFilters).toEqual({});
  });

  it('не затрагивает другие поля стора (items, isLoading, error)', () => {
    const items = [makeHistoryItem(1), makeHistoryItem(2)];
    useHistoryStore.setState({
      historyFilters: { yearFrom: 2020 },
      items,
      isLoading: false,
      error: null,
    });

    act(() => {
      useHistoryStore.getState().resetFilters();
    });

    const { items: savedItems, isLoading, error } = useHistoryStore.getState();
    expect(savedItems).toHaveLength(2);
    expect(isLoading).toBe(false);
    expect(error).toBeNull();
  });

  it('вызов при уже пустых фильтрах — не бросает ошибку, результат {}', () => {
    act(() => {
      useHistoryStore.getState().resetFilters();
    });

    expect(useHistoryStore.getState().historyFilters).toEqual({});
  });
});
