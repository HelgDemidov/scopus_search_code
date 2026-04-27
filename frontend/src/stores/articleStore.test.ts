import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import type { PaginatedArticleResponse } from '../types/api';
import type { ArticleResponse } from '../types/api';
import type { PageSize } from '../components/articles/PaginationBar';

// ---------------------------------------------------------------------------
// Моки модулей — объявляем ДО первого импорта стора
// ---------------------------------------------------------------------------

// Мок API — перекрываем getArticles и findArticles
vi.mock('../api/articles', () => ({
  getArticles: vi.fn(),
  findArticles: vi.fn(),
}));

// Мок historyStore — перекрываем dynamic import внутри fetchArticles:
//   const { useHistoryStore } = await import('./historyStore')
// historyFilters: {} означает «не применять client-side фильтры»
vi.mock('./historyStore', () => ({
  useHistoryStore: {
    getState: () => ({
      historyFilters: {},
    }),
  },
}));

// ---------------------------------------------------------------------------
// Импорты после vi.mock
// ---------------------------------------------------------------------------

import { useArticleStore } from './articleStore';
import { getArticles } from '../api/articles';

// ---------------------------------------------------------------------------
// Вспомогательные данные
// ---------------------------------------------------------------------------

// Начальное состояние стора — используется для сброса в beforeEach.
// size аннотируем как PageSize (10 | 25 | 50), иначе TS2345: number not assignable to PageSize
const INITIAL_STATE = {
  articles: [] as ArticleResponse[],
  total: 0,
  page: 1,
  size: 10 as PageSize,
  filters: {},
  sortBy: 'date' as const,
  appendMode: false,
  liveResults: [] as ArticleResponse[],
  scopusQuota: null,
  isLoading: false,
  isLiveSearching: false,
  error: null,
};

// Фабрика минимальной статьи — только поля, существующие в ArticleResponse.
// keyword: string (не null) — TS2352 при null, потому что ArticleResponse.keyword: string
function makeArticle(id: number): ArticleResponse {
  return {
    id,
    title: `Article ${id}`,
    author: null,
    publication_date: '2024-01-01',
    cited_by_count: 0,
    doi: null,
    journal: null,
    document_type: null,
    open_access: false,
    affiliation_country: null,
    keyword: 'seeder_migration',
  };
}

// Фабрика ответа getArticles.
// PaginatedArticleResponse = { articles, total } — без page и size (TS2353 при наличии)
function makePaginatedResponse(
  articles: ArticleResponse[],
  total = articles.length,
): PaginatedArticleResponse {
  return { articles, total };
}

// Типизированный мок getArticles
const mockedGetArticles = vi.mocked(getArticles);

// ---------------------------------------------------------------------------
// beforeEach — сброс стора и моков между кейсами
// ---------------------------------------------------------------------------

beforeEach(() => {
  // Zustand — синглтон: явно сбрасываем state перед каждым тестом
  useArticleStore.setState(INITIAL_STATE);
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Блок 1: setSize
// ---------------------------------------------------------------------------

describe('setSize', () => {
  it('обновляет size, сбрасывает page=1 и articles=[]', () => {
    // Предустанавливаем ненулевое состояние
    useArticleStore.setState({
      size: 10 as PageSize,
      page: 3,
      articles: [makeArticle(1)],
    });

    act(() => {
      useArticleStore.getState().setSize(25);
    });

    const { size, page, articles } = useArticleStore.getState();
    expect(size).toBe(25);
    expect(page).toBe(1);
    expect(articles).toHaveLength(0);
  });

  it('не сбрасывает appendMode — spec-тест намерения', () => {
    // appendMode=true должен сохраняться после смены size;
    // компонент (Шаг 3) управляет appendMode независимо
    useArticleStore.setState({ appendMode: true });

    act(() => {
      useArticleStore.getState().setSize(50);
    });

    expect(useArticleStore.getState().appendMode).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Блок 2: setAppendMode
// ---------------------------------------------------------------------------

describe('setAppendMode', () => {
  it('setAppendMode(true) устанавливает appendMode=true', () => {
    act(() => {
      useArticleStore.getState().setAppendMode(true);
    });
    expect(useArticleStore.getState().appendMode).toBe(true);
  });

  it('setAppendMode(false) устанавливает appendMode=false', () => {
    useArticleStore.setState({ appendMode: true });

    act(() => {
      useArticleStore.getState().setAppendMode(false);
    });

    expect(useArticleStore.getState().appendMode).toBe(false);
  });

  it('не сбрасывает articles и page — side-effect отсутствует', () => {
    // Поведение намеренное: компонент сам вызывает setPage(1) при необходимости.
    // Тест фиксирует это как спецификацию, а не баг.
    const existingArticles = [makeArticle(1), makeArticle(2)];
    useArticleStore.setState({ articles: existingArticles, page: 3 });

    act(() => {
      useArticleStore.getState().setAppendMode(true);
    });

    const { articles, page } = useArticleStore.getState();
    expect(articles).toHaveLength(2);
    expect(page).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Блок 3: fetchArticles
// ---------------------------------------------------------------------------

describe('fetchArticles', () => {
  it('numbered-режим (appendMode=false): заменяет articles', async () => {
    const incoming = [makeArticle(10), makeArticle(11)];
    mockedGetArticles.mockResolvedValueOnce(makePaginatedResponse(incoming, 2));

    // Предустанавливаем старые данные и appendMode=false
    useArticleStore.setState({
      articles: [makeArticle(99)],
      appendMode: false,
      page: 1,
    });

    await act(async () => {
      await useArticleStore.getState().fetchArticles();
    });

    const { articles, total } = useArticleStore.getState();
    expect(articles).toHaveLength(2);
    expect(articles[0].id).toBe(10);
    expect(total).toBe(2);
  });

  it('append-режим, page=2: аппендит к prev из снепшота №2', async () => {
    const prev = [makeArticle(1), makeArticle(2)];
    const incoming = [makeArticle(3), makeArticle(4)];
    mockedGetArticles.mockResolvedValueOnce(makePaginatedResponse(incoming, 4));

    // Снепшот №2 читает appendMode и page ПОСЛЕ await — выставляем оба явно
    useArticleStore.setState({
      articles: prev,
      appendMode: true,
      page: 2, // currentPage > 1 → ветка аппенда
    });

    await act(async () => {
      await useArticleStore.getState().fetchArticles();
    });

    const { articles } = useArticleStore.getState();
    expect(articles).toHaveLength(4);
    expect(articles.map((a) => a.id)).toEqual([1, 2, 3, 4]);
  });

  it('append-режим, page=1: заменяет (граничное условие currentPage > 1)', async () => {
    const prev = [makeArticle(99)];
    const incoming = [makeArticle(1)];
    mockedGetArticles.mockResolvedValueOnce(makePaginatedResponse(incoming, 1));

    // page=1 → условие (appendMode && currentPage > 1) = false → replace
    useArticleStore.setState({
      articles: prev,
      appendMode: true,
      page: 1,
    });

    await act(async () => {
      await useArticleStore.getState().fetchArticles();
    });

    const { articles } = useArticleStore.getState();
    expect(articles).toHaveLength(1);
    expect(articles[0].id).toBe(1);
  });

  it('isLoading=true во время запроса, false после завершения', async () => {
    let loadingDuringFetch = false;

    // Перехватываем состояние во время ожидания промиса
    mockedGetArticles.mockImplementationOnce(() => {
      loadingDuringFetch = useArticleStore.getState().isLoading;
      return Promise.resolve(makePaginatedResponse([]));
    });

    await act(async () => {
      await useArticleStore.getState().fetchArticles();
    });

    expect(loadingDuringFetch).toBe(true);
    expect(useArticleStore.getState().isLoading).toBe(false);
  });

  it('ошибка сети: error заполняется, isLoading=false', async () => {
    mockedGetArticles.mockRejectedValueOnce(new Error('Network error'));

    await act(async () => {
      await useArticleStore.getState().fetchArticles();
    });

    const { error, isLoading } = useArticleStore.getState();
    expect(error).toBe('Network error');
    expect(isLoading).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Блок 4: setFilters
// ---------------------------------------------------------------------------

describe('setFilters', () => {
  it('сбрасывает page=1 и articles=[], мержит фильтры', () => {
    useArticleStore.setState({
      page: 5,
      articles: [makeArticle(1)],
      filters: { keyword: 'ai' },
    });

    act(() => {
      useArticleStore.getState().setFilters({ search: 'neural' });
    });

    const { page, articles, filters } = useArticleStore.getState();
    expect(page).toBe(1);
    expect(articles).toHaveLength(0);
    // keyword сохранён, search добавлен
    expect(filters.keyword).toBe('ai');
    expect(filters.search).toBe('neural');
  });

  it('мержит частично, не затирает незатронутые поля', () => {
    useArticleStore.setState({
      filters: { keyword: 'llm', search: 'transformer' },
    });

    act(() => {
      useArticleStore.getState().setFilters({ keyword: 'gnn' });
    });

    const { filters } = useArticleStore.getState();
    expect(filters.keyword).toBe('gnn');
    // search не затронут — должен остаться
    expect(filters.search).toBe('transformer');
  });
});
