// Типы, описывающие схемы ответов бэкенда (§2.3 спека)
// и вспомогательные интерфейсы состояния (§4.1)

// ---------------------------------------------------------------------------
// Статья
// ---------------------------------------------------------------------------

export interface ArticleResponse {
  title: string;
  journal: string | null;
  author: string | null;
  publication_date: string;        // 'YYYY-MM-DD'
  doi: string | null;
  keyword: string;
  cited_by_count: number | null;
  document_type: string | null;
  open_access: boolean | null;
  affiliation_country: string | null;
}

export interface PaginatedArticleResponse {
  articles: ArticleResponse[];
  total: number;
}

// ---------------------------------------------------------------------------
// Статистика коллекции
// ---------------------------------------------------------------------------

export interface LabelCount {
  label: string;
  count: number;
}

export interface StatsResponse {
  total_articles: number;
  total_journals: number;
  total_countries: number;
  open_access_count: number;
  by_year: LabelCount[];
  by_journal: LabelCount[];
  by_country: LabelCount[];
  by_doc_type: LabelCount[];
  top_keywords: LabelCount[];
}

// ---------------------------------------------------------------------------
// Пользователь
// ---------------------------------------------------------------------------

export interface UserResponse {
  id: number;
  // username может быть null у пользователей, зарегистрированных через Google OAuth
  username: string | null;
  email: string;
  // created_at может быть null (OAuth-пользователи создаются без явной метки)
  created_at: string | null;       // ISO 8601 datetime
}

// ---------------------------------------------------------------------------
// Токен авторизации
// ---------------------------------------------------------------------------

export interface TokenResponse {
  access_token: string;
  token_type: string;              // всегда 'bearer'
}

// ---------------------------------------------------------------------------
// Фильтры статей (§4.1 ArticleFilters)
// keyword — серверная фильтрация (query-param к GET /articles/)
// остальные поля — client-side фильтрация загруженного набора
// ---------------------------------------------------------------------------

export interface ArticleFilters {
  keyword?: string;                // фраза сидера для серверной фильтрации
  yearFrom?: number;               // нижняя граница года публикации
  yearTo?: number;                 // верхняя граница года публикации
  docTypes?: string[];             // массив типов документов
  openAccessOnly?: boolean;        // только open access
  countries?: string[];            // массив стран аффилиации
}

// ---------------------------------------------------------------------------
// Квота Scopus API (из заголовков ответа X-RateLimit-*)
// ---------------------------------------------------------------------------

export interface ScopusQuota {
  remaining: number;
  limit: number;
}
