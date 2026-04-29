import axios from 'axios';
import { create } from 'zustand';
import { getArticles, findArticles } from '../api/articles';
import type { PageSize } from '../components/articles/PaginationBar';
import type { ArticleResponse, ArticleFilters, ArticleClientFilters } from '../types/api';

// Интерфейс стора статей — §4.1
// fetchStats и stats здесь отсутствуют намеренно: они живут только в useStatsStore
interface ArticleStore {
  // Данные с сервера
  articles: ArticleResponse[];
  total: number;

  // Параметры запроса к GET /articles/
  page: number;
  size: PageSize;   // 10 | 25 | 50 — совпадает с PaginationBar.SIZE_OPTIONS
  filters: ArticleFilters;
  sortBy: 'date' | 'citations';

  // Режим накопления страниц (true = append, false = replace)
  appendMode: boolean;

  // Live-поиск через Scopus API (только для авторизованных)
  liveResults: ArticleResponse[];
  scopusQuota: { remaining: number; limit: number } | null;

  // Режим отображения live-результатов Scopus:
  //   10 — показывать по 10 результатов с пагинатором (макс. 3 страницы)
  //   'all' — показать все вернувшиеся результаты (до 25) без пагинатора
  liveSize: 10 | 'all';

  // UI-состояние
  isLoading: boolean;
  isLiveSearching: boolean;
  error: string | null;

  // Экшены
  fetchArticles: (keyword?: string) => Promise<void>;
  setFilters: (filters: Partial<ArticleFilters>) => void;
  setPage: (page: number) => void;
  setSize: (size: PageSize) => void;
  setAppendMode: (mode: boolean) => void;
  setSortBy: (sortBy: 'date' | 'citations') => void;
  setLiveSize: (s: 10 | 'all') => void;
  searchScopusLive: (keyword: string) => Promise<void>;
}

// Вспомогательная функция: применяет client-side фильтры к массиву статей
// Принимает отдельный аргумент clientFilters (из historyStore) согласно §1.3
function applyClientFilters(
  articles: ArticleResponse[],
  clientFilters: ArticleClientFilters,
): ArticleResponse[] {
  return articles.filter((a) => {
    // Фильтр по году публикации
    if (clientFilters.yearFrom || clientFilters.yearTo) {
      const year = a.publication_date
        ? parseInt(a.publication_date.slice(0, 4), 10)
        : null;
      if (year === null) return false;
      if (clientFilters.yearFrom && year < clientFilters.yearFrom) return false;
      if (clientFilters.yearTo && year > clientFilters.yearTo) return false;
    }

    // Фильтр по типу документа
    if (clientFilters.docTypes && clientFilters.docTypes.length > 0) {
      if (!a.document_type || !clientFilters.docTypes.includes(a.document_type)) {
        return false;
      }
    }

    // Фильтр Open Access
    if (clientFilters.openAccessOnly && !a.open_access) return false;

    // Фильтр по стране аффиляции
    if (clientFilters.countries && clientFilters.countries.length > 0) {
      if (!a.affiliation_country || !clientFilters.countries.includes(a.affiliation_country)) {
        return false;
      }
    }

    return true;
  });
}

export const useArticleStore = create<ArticleStore>((set, get) => ({
  articles: [],
  total: 0,
  page: 1,
  size: 10,   // PageSize — минимальный вариант из SIZE_OPTIONS
  filters: {},
  sortBy: 'date',
  appendMode: false,
  liveResults: [],
  scopusQuota: null,
  liveSize: 10,   // дефолт — постраничный режим по 10 результатов
  isLoading: false,
  isLiveSearching: false,
  error: null,

  // Загружаем страницу статей с учётом серверных фильтров:
  //   keyword (аргумент или filters.keyword) — точный фильтр по полю сидера
  //   filters.search — ILIKE-поиск по title/author (пользовательский запрос)
  // keyword из аргумента имеет приоритет над filters.keyword: вызывающий код
  // передаёт его явно сразу после setFilters, не дожидаясь обновления стейта
  fetchArticles: async (keyword?: string) => {
    // Снепшот №1 — параметры запроса (до await, пока page/size/filters актуальны)
    const { page, size, filters } = get();
    const effectiveKeyword = keyword !== undefined ? keyword : filters.keyword;
    set({ isLoading: true, error: null });
    try {
      const data = await getArticles({
        page,
        size,
        keyword: effectiveKeyword,  // фильтр по полю keyword сидера
        search: filters.search,     // ILIKE-поиск (undefined -> параметр не уходит)
      });
      // Берём client-side фильтры из historyStore согласно §1.3
      const { useHistoryStore } = await import('./historyStore');
      const { historyFilters } = useHistoryStore.getState();
      // Применяем client-side фильтры к загруженной странице
      const filtered = applyClientFilters(data.articles, historyFilters);
      // Сортировка по цитированиям — client-side, в пределах текущей страницы
      const sorted =
        get().sortBy === 'citations'
          ? [...filtered].sort(
              (a, b) => (b.cited_by_count ?? 0) - (a.cited_by_count ?? 0),
            )
          : filtered;
      // Снепшот №2 — читаем appendMode и prev ПОСЛЕ await, чтобы не поймать
      // устаревший стейт из замыкания (пользователь мог сменить страницу)
      const { appendMode, articles: prev, page: currentPage } = get();
      set({
        articles: appendMode && currentPage > 1 ? [...prev, ...sorted] : sorted,
        total: data.total,
        isLoading: false,
      });
    } catch (err: unknown) {
      // ERR_CANCELED — AbortSignal cancellation: silent drop, не обновляем error
      if (axios.isAxiosError(err) && err.code === 'ERR_CANCELED') {
        set({ isLoading: false });
        return;
      }
      // AxiosError: предпочитаем FastAPI HTTPException.detail, fallback — message
      const message = axios.isAxiosError(err)
        ? (err.response?.data?.detail ?? err.message)
        : err instanceof Error ? err.message : 'Failed to load articles';
      set({ error: message, isLoading: false });
    }
  },

  // Обновляем серверные фильтры, сбрасываем на первую страницу и очищаем список
  setFilters: (newFilters: Partial<ArticleFilters>) => {
    set((state) => ({
      filters: { ...state.filters, ...newFilters },
      page: 1,
      articles: [],  // сброс списка при смене фильтра — критично для appendMode
    }));
  },

  // Обновляем текущую страницу
  setPage: (page: number) => set({ page }),

  // Меняем размер страницы — сбрасываем на первую и очищаем список
  setSize: (size: PageSize) => set({ size, page: 1, articles: [] }),

  // Включаем/выключаем режим накопления страниц
  setAppendMode: (mode: boolean) => set({ appendMode: mode }),

  // Переключаем сортировку и немедленно пересортируем текущий список
  setSortBy: (sortBy: 'date' | 'citations') => {
    set((state) => {
      const sorted =
        sortBy === 'citations'
          ? [...state.articles].sort(
              (a, b) => (b.cited_by_count ?? 0) - (a.cited_by_count ?? 0),
            )
          : [...state.articles].sort((a, b) =>
              (b.publication_date ?? '').localeCompare(a.publication_date ?? ''),
            );
      return { sortBy, articles: sorted };
    });
  },

  // Переключает режим отображения live-результатов;
  // сброс livePage в 1 — ответственность компонента (livePage живёт в useState)
  setLiveSize: (s: 10 | 'all') => set({ liveSize: s }),

  // Live-поиск через Scopus API; сохраняем квоту из заголовков ответа
  searchScopusLive: async (keyword: string) => {
    set({ isLiveSearching: true, error: null });
    try {
      const { articles, quota } = await findArticles(keyword, 25);
      set({
        liveResults: articles,
        scopusQuota: quota,
        isLiveSearching: false,
        liveSize: 10,   // сбрасываем режим при каждом новом запросе к Scopus
      });
      // После live-поиска обновляем quotaStore через fetchQuota():
      // /articles/find/quota возвращает полный QuotaResponse (limit, used, remaining, reset_at),
      // который требует LiveSearchQuotaCounter. Fire-and-forget — не блокирует завершение поиска
      if (quota) {
        void import('./quotaStore').then(({ useQuotaStore }) =>
          useQuotaStore.getState().fetchQuota(),
        );
      }
    } catch (err: unknown) {
      let message: string;
      // 429 — квота Scopus исчерпана: специальный sentinel для UI
      if (axios.isAxiosError(err) && err.response?.status === 429) {
        message = 'QUOTA_EXCEEDED';
      } else if (axios.isAxiosError(err)) {
        // Остальные HTTP-ошибки: предпочитаем FastAPI detail, fallback — message
        message = err.response?.data?.detail ?? err.message;
      } else {
        message = err instanceof Error ? err.message : 'Live search failed';
      }
      set({ error: message, isLiveSearching: false });
    }
  },
}));
