// API-функции для работы со статьями (§2.1, §2.2 спека)
//
// getArticles     — GET /articles/              (публичный, пагинация + фильтры)
// getSearchStats  — GET /articles/search/stats  (приватный, агрегаты по поисковому запросу)
// findArticles    — GET /articles/find          (приватный, live-поиск в Scopus)
// getArticleById  — GET /articles/:id           (публичный, одна статья по id)
// getSearchHistory — GET /articles/history      (приватный, история поисков пользователя)
// getScopusQuota  — GET /articles/find/quota    (приватный, состояние квоты)

import { apiClient } from './client';
import type {
  PaginatedArticleResponse,
  ArticleResponse,
  SearchStatsResponse,
  ScopusQuota,
  SearchHistoryItem,
  SearchHistoryResponse,
  QuotaResponse,
} from '../types/api';

// ---------------------------------------------------------------------------
// Параметры запроса для getArticles
// ---------------------------------------------------------------------------

export interface GetArticlesParams {
  page?: number;
  size?: number;
  // keyword — серверная фильтрация по полю articles.keyword (фраза сидера);
  // при отсутствии совпадений бэкенд возвращает пустой список
  keyword?: string;
  // search — ILIKE-поиск по title и author (пользовательский запрос, коммит 2);
  // keyword и search независимы на уровне API; стор обеспечивает взаимоисключение
  search?: string;
  // signal — AbortSignal для отмены запроса (axios >= 0.22 + fetch API);
  // вызывающие стороны без signal не замечают изменений
  signal?: AbortSignal;
}

// ---------------------------------------------------------------------------
// GET /articles/ — загрузка пагинированного списка статей из БД
// ---------------------------------------------------------------------------

export async function getArticles(
  params: GetArticlesParams = {},
): Promise<PaginatedArticleResponse> {
  const { page = 1, size = 10, keyword, search, signal } = params;

  const queryParams: Record<string, string | number> = { page, size };
  if (keyword) queryParams.keyword = keyword;
  if (search)  queryParams.search  = search;

  const response = await apiClient.get<PaginatedArticleResponse>('/articles/', {
    params: queryParams,
    signal,
  });
  return response.data;
}

// ---------------------------------------------------------------------------
// GET /articles/search/stats — агрегаты по пользовательскому поисковому запросу
// Требует JWT (приватный эндпоинт)
// search — непустая строка запроса; бэкенд применяет ILIKE по title и author
// ---------------------------------------------------------------------------

export async function getSearchStats(
  search: string,
): Promise<SearchStatsResponse> {
  const response = await apiClient.get<SearchStatsResponse>(
    '/articles/search/stats',
    { params: { search } },
  );
  return response.data;
}

// ---------------------------------------------------------------------------
// GET /articles/:id — одна статья по первичному ключу (публичный)
// ---------------------------------------------------------------------------

export async function getArticleById(id: number): Promise<ArticleResponse> {
  // JWT не требуется — эндпоинт публичный
  // 404 от бэкенда пробрасывается наружу — обрабатывает ArticlePage
  const response = await apiClient.get<ArticleResponse>(`/articles/${id}`);
  return response.data;
}

// ---------------------------------------------------------------------------
// Результат live-поиска — статьи + квота Scopus
// ---------------------------------------------------------------------------

export interface FindArticlesResult {
  articles: ArticleResponse[];
  quota: ScopusQuota | null;
}

// ---------------------------------------------------------------------------
// GET /articles/find — live-поиск через Scopus API (только для авторизованных)
// Требует JWT; квота читается из заголовков X-RateLimit-*
// ---------------------------------------------------------------------------

export async function findArticles(
  keyword: string,
  count: number = 25,
): Promise<FindArticlesResult> {
  const response = await apiClient.get<ArticleResponse[]>('/articles/find', {
    params: { keyword, count },
  });

  // Извлекаем квоту из заголовков ответа
  const remaining = response.headers['x-ratelimit-remaining'];
  const limit = response.headers['x-ratelimit-limit'];

  const quota: ScopusQuota | null =
    remaining !== undefined && limit !== undefined
      ? { remaining: Number(remaining), limit: Number(limit) }
      : null;

  return { articles: response.data, quota };
}

// ---------------------------------------------------------------------------
// GET /articles/history — история поисков текущего пользователя
//
// Бэкенд всегда возвращает SearchHistoryResponse { items, total };
// bare-array никогда не возвращается (verified: SearchHistoryResponse Pydantic schema).
// ---------------------------------------------------------------------------

export async function getSearchHistory(): Promise<SearchHistoryItem[]> {
  const response = await apiClient.get<SearchHistoryResponse>('/articles/history');
  return response.data.items;
}

// ---------------------------------------------------------------------------
// GET /articles/find/quota — Scopus-квота пользователя (недельное окно)
// ---------------------------------------------------------------------------

export async function getScopusQuota(): Promise<QuotaResponse> {
  const response = await apiClient.get<QuotaResponse>('/articles/find/quota');
  return response.data;
}
