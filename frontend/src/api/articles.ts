// API-функции для работы со статьями (§2.1, §2.2 спека)
//
// getArticles     — GET /articles/        (публичный, пагинация + keyword-фильтр)
// findArticles    — GET /articles/find   (приватный, live-поиск в Scopus)
// getArticleById  — GET /articles/:id    (публичный, одна статья по id)

import { apiClient } from './client';
import type {
  PaginatedArticleResponse,
  ArticleResponse,
  ScopusQuota,
} from '../types/api';

// ---------------------------------------------------------------------------
// Параметры запроса для getArticles
// ---------------------------------------------------------------------------

export interface GetArticlesParams {
  page?: number;
  size?: number;
  // keyword — серверная фильтрация по полю keyword (фраза сидера);
  // при отсутствии совпадений бэкенд возвращает пустой список
  keyword?: string;
}

// ---------------------------------------------------------------------------
// GET /articles/ — загрузка пагинированного списка статей из БД
// ---------------------------------------------------------------------------

export async function getArticles(
  params: GetArticlesParams = {},
): Promise<PaginatedArticleResponse> {
  const { page = 1, size = 10, keyword } = params;

  const queryParams: Record<string, string | number> = { page, size };
  if (keyword) {
    queryParams.keyword = keyword;
  }

  const response = await apiClient.get<PaginatedArticleResponse>('/articles/', {
    params: queryParams,
  });
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
