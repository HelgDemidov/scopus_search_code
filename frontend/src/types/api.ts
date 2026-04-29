// Типы, описывающие схемы ответов бэкенда (§2.3 спека)
// и вспомогательные интерфейсы состояния (§4.1)

// ---------------------------------------------------------------------------
// Статья
// ---------------------------------------------------------------------------

export interface ArticleResponse {
  id: number;                      // первичный ключ — используется в маршруте /article/:id
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
// Статистика коллекции (GET /articles/stats — только сидированные статьи)
// ---------------------------------------------------------------------------

export interface LabelCount {
  label: string;
  count: number;
}

// Алиас для обратной совместимости с chart-компонентами
export type StatsItem = LabelCount;

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
// Статистика поискового запроса (GET /articles/search/stats?search=...)
// Отдельный интерфейс — не алиас StatsResponse:
//   - нет total_articles, total_journals, total_countries, open_access_count
//   - нет top_keywords
//   - есть total (кол-во статей, совпавших с поисковым запросом)
// Схема подтверждена живым тестом эндпоинта (коммит 2 + хотфикс)
// ---------------------------------------------------------------------------

export interface SearchStatsResponse {
  total: number;
  by_year: LabelCount[];
  by_journal: LabelCount[];
  by_country: LabelCount[];
  by_doc_type: LabelCount[];
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
//
// ArticleFilters — только серверные параметры для GET /articles/:
//   keyword — точный фильтр по полю articles.keyword (фраза сидера)
//   search  — ILIKE-поиск по title и author (пользовательский запрос)
//   keyword и search взаимоисключающие; стор не передаёт оба одновременно
//
// ArticleClientFilters — client-side фильтры; применяются в браузере
//   к загруженной странице; живут в historyStore.historyFilters
// ---------------------------------------------------------------------------

export interface ArticleFilters {
  keyword?: string;                // точный фильтр по полю keyword сидера
  search?: string;                 // пользовательский текстовый поиск по title/author
}

export interface ArticleClientFilters {
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

export interface SearchHistoryItem {
  id: number;
  query: string;
  created_at: string;
  result_count: number;
  filters: Record<string, unknown>;
  results_available: boolean;      // вычисляется бэкендом как result_count > 0
}

// Ответ GET /articles/history — зеркало SearchHistoryResponse (Pydantic)
// Бэкенд всегда возвращает эту форму; bare-array никогда не возвращается
export interface SearchHistoryResponse {
  items: SearchHistoryItem[];
  total: number;
}

export interface QuotaResponse {
  limit: number;
  used: number;
  remaining: number;
  reset_at: string;
  window_days?: number;
}

// ---------------------------------------------------------------------------
// Результаты конкретного поиска (GET /articles/history/{search_id}/results)
// Поле search_id — намеренное переименование от ТЗ-имени search_history_id;
// принято командой как окончательное имя контракта (коммит 4ea6488)
// ---------------------------------------------------------------------------

export interface SearchResultsResponse {
  search_id: number;               // соответствует search_id в URL /history/{search_id}/results
  query: string;                   // исходный поисковый запрос
  created_at: string;              // ISO 8601 datetime поиска
  articles: ArticleResponse[];
  total: number;
}
