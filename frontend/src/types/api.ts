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
  items: ArticleResponse[];  // переименовано articles → items: синхронизировано с бэкенд-схемой
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

// Кросс-агрегаты для стационарных графиков /explore (docs/explore-cross-analytics/spec.md §2)
export interface YearCountryCount {
  year: number;
  country: string;
  count: number;
}

export interface SunburstSegment {
  country: string;
  open_access: boolean;
  count: number;
}

export interface JournalCountryCount {
  journal: string;
  country: string; // топ-5 (тот же набор, что в SunburstSegment) + "Other"
  count: number;
}

export interface StatsResponse {
  total_articles: number;
  total_journals: number;
  total_countries: number;
  total_authors: number;
  open_access_count: number;
  by_year: LabelCount[];
  by_journal: LabelCount[];
  by_country: LabelCount[];
  by_doc_type: LabelCount[];
  top_keywords: LabelCount[];
  top_authors: LabelCount[];
  by_year_top_countries: YearCountryCount[];
  sunburst_country_open_access: SunburstSegment[];
  top_journals_by_country: JournalCountryCount[];
}

// ---------------------------------------------------------------------------
// Journal Landscape Scatter + Table Builder (docs/explore-table-builder/spec.md)
// ---------------------------------------------------------------------------

// Точка scatter — GET /articles/stats/journal-impact?max_year=
export interface JournalImpactPoint {
  journal: string;
  count: number;
  mean_citations: number;
  median_citations: number;
}

// Whitelist измерений Table Builder (spec.md §3.1) — синхронизировано с
// app.schemas.article_schemas.PivotDimension. 'author' сознательно исключён
// (нет ORCID, риск ложной агрегации по однофамильцам).
export type PivotDimension = 'year' | 'country' | 'doc_type' | 'journal' | 'open_access';

// GET /articles/stats/pivot — 2D pivot по 2 измерениям + опциональный slicer
export interface PivotResponse {
  row_dim: PivotDimension;
  col_dim: PivotDimension;
  row_labels: string[];
  col_labels: string[];
  matrix: number[][];
  row_totals: number[];
  col_totals: number[];
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
  // label: "true"/"false" (docs/personal-search-data/spec.md §2.1) — та же конвенция,
  // что и канонический DimensionStatsSource.by_open_access ниже
  by_open_access: LabelCount[];
}

// ---------------------------------------------------------------------------
// Общий интерфейс данных KPI/Drawer (docs/explore-personal-redesign/spec.md §1.2) —
// объединяет StatsResponse (collection) и SearchStatsResponse (personal) для
// переиспользования DimensionDrawer между режимами. by_open_access — канонически
// РОВНО 2 элемента с лейблами 'true'/'false' (конвенция PivotDimension/
// postgres_catalog_repo._stringify_dim); для collection строится адаптером из
// open_access_count/total_articles, для personal — уже в этом виде из бэкенда.
// top_authors — опционально: только collection, personal не предоставляет
// (см. spec.md §1.1 — author исключён из personal KPI/drawer).
// ---------------------------------------------------------------------------

export interface DimensionStatsSource {
  total: number;
  by_year: LabelCount[];
  by_country: LabelCount[];
  by_doc_type: LabelCount[];
  by_journal: LabelCount[];
  by_open_access: LabelCount[];
  top_authors?: LabelCount[];
}

// ---------------------------------------------------------------------------
// Поисковая активность по времени (GET /articles/stats/personal/activity)
// docs/explore-personal-redesign/spec.md §2.1
// ---------------------------------------------------------------------------

export interface PersonalActivityBucket {
  period_start: string;               // 'YYYY-MM-DD' — начало периода (week/month)
  successful_searches: number;        // result_count > 0
  zero_result_searches: number;       // result_count == 0 — потраченная впустую квота
  cumulative_unique_articles: number; // нарастающим итогом на конец периода
}

export interface PersonalActivityResponse {
  granularity: 'week' | 'month';      // выбрано автоматически по разбросу истории
  buckets: PersonalActivityBucket[];
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
// ArticleFilters — серверные параметры для GET /articles/ и GET /articles/find;
//   используют snake_case, т.к. уходят напрямую как query-параметры бэкенда:
//   keyword    — точный фильтр по полю articles.keyword (фраза сидера)
//   search     — ILIKE-поиск по title и author (пользовательский запрос)
//   year_from  — нижняя граница года публикации (включительно)
//   year_to    — верхняя граница года публикации (включительно)
//   doc_types  — массив кодов типов документа (ar, re, cp ...)
//   open_access — только open-access статьи; undefined = фильтр не применяется
//   countries  — массив стран аффилиации
//
// keyword и search взаимоисключающие; стор не передаёт оба одновременно
//
// ArticleClientFilters — client-side фильтры; используют camelCase;
//   живут в historyStore.historyFilters; в коммите 6 маппятся в ArticleFilters
// ---------------------------------------------------------------------------

export interface ArticleFilters {
  keyword?: string;                // точный фильтр по полю keyword сидера
  search?: string;                 // пользовательский текстовый поиск по title/author
  year_from?: number;              // нижняя граница года публикации
  year_to?: number;                // верхняя граница года публикации
  doc_types?: string[];            // массив кодов типов документа
  open_access?: boolean;           // true = только OA; undefined = без фильтра
  countries?: string[];            // массив стран аффилиации
}

export interface ArticleClientFilters {
  yearFrom?: number;               // нижняя граница года публикации
  yearTo?: number;                 // верхняя граница года публикации
  docTypes?: string[];             // массив типов документов
  openAccessOnly?: boolean;        // только open access
  countries?: string[];            // массив стран аффилиации
}

// ---------------------------------------------------------------------------
// Режим поиска
// ---------------------------------------------------------------------------

export type SearchMode = 'scopus' | 'catalog';

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
