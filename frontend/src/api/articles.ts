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
  // Серверные фильтры — передаются как query-параметры GET /articles/
  year_from?: number;
  year_to?: number;
  doc_types?: string[];
  open_access?: boolean;
  countries?: string[];
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
  const {
    page = 1, size = 10,
    keyword, search,
    year_from, year_to,
    doc_types, open_access, countries,
    signal,
  } = params;

  // URLSearchParams обеспечивает корректную сериализацию массивов:
  // ?doc_types=ar&doc_types=re (без квадратных скобок, как ожидает FastAPI Query)
  const queryParams = new URLSearchParams();
  queryParams.set('page', String(page));
  queryParams.set('size', String(size));

  // Скалярные фильтры — добавляем только при наличии значения
  if (keyword)              queryParams.set('keyword', keyword);
  if (search)               queryParams.set('search', search);
  if (year_from != null)    queryParams.set('year_from', String(year_from));
  if (year_to != null)      queryParams.set('year_to', String(year_to));
  if (open_access != null)  queryParams.set('open_access', String(open_access));

  // Массивы — каждый элемент отдельным append
  doc_types?.forEach(v => queryParams.append('doc_types', v));
  countries?.forEach(v => queryParams.append('countries', v));

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
// Параметры live-поиска через Scopus API
// ---------------------------------------------------------------------------

export interface FindArticlesParams {
  keyword: string;
  count?: number;                  // кол-во результатов (макс. 25, дефолт 25)
  // Фильтры, передаваемые в Scopus через бэкенд
  year_from?: number;
  year_to?: number;
  doc_types?: string[];
  open_access?: boolean;
  countries?: string[];
}

// ---------------------------------------------------------------------------
// GET /articles/find — live-поиск через Scopus API (только для авторизованных)
// Требует JWT; квота читается из заголовков X-RateLimit-*
//
// Breaking change (коммит 5): сигнатура изменена с (keyword, count) на (params)
// Единственный вызов в articleStore.ts обновлён в этом же коммите
// ---------------------------------------------------------------------------

export async function findArticles(
  params: FindArticlesParams,
): Promise<FindArticlesResult> {
  const {
    keyword, count = 25,
    year_from, year_to,
    doc_types, open_access, countries,
  } = params;

  // URLSearchParams — та же причина, что и в getArticles: корректная
  // сериализация массивов без квадратных скобок для FastAPI Query()
  const queryParams = new URLSearchParams();
  queryParams.set('keyword', keyword);
  queryParams.set('count', String(count));

  if (year_from != null)    queryParams.set('year_from', String(year_from));
  if (year_to != null)      queryParams.set('year_to', String(year_to));
  if (open_access != null)  queryParams.set('open_access', String(open_access));

  doc_types?.forEach(v => queryParams.append('doc_types', v));
  countries?.forEach(v => queryParams.append('countries', v));

  const response = await apiClient.get<ArticleResponse[]>('/articles/find', {
    params: queryParams,
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
