import { create } from 'zustand';
import { getArticles, findArticles } from '../api/articles';
import type { ArticleResponse, ArticleFilters, ArticleClientFilters } from '../types/api';

// Интерфейс стора статей — §4.1
// fetchStats и stats здесь отсутствуют намеренно: они живут только в useStatsStore
interface ArticleStore {
  // Данные с сервера
  articles: ArticleResponse[];
  total: number;

  // Параметры запроса к GET /articles/
  page: number;
  size: number;
  filters: ArticleFilters;
  sortBy: 'date' | 'citations';

  // Live-поиск через Scopus API (только для авторизованных)
  liveResults: ArticleResponse[];
  scopusQuota: { remaining: number; limit: number } | null;

  // UI-состояние
  isLoading: boolean;
  isLiveSearching: boolean;
  error: string | null;

  // Экшены
  fetchArticles: (keyword?: string) => Promise<void>;
  setFilters: (filters: Partial<ArticleFilters>) => void;
  setPage: (page: number) => void;
  setSortBy: (sortBy: 'date' | 'citations') => void;
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
  size: 10,
  filters: {},
  sortBy: 'date',
  liveResults: [],
  scopusQuota: null,
  isLoading: false,
  isLiveSearching: false,
  error: null,

  // Загружаем страницу статей с учётом серверных фильтров:
  //   keyword (аргумент или filters.keyword) — точный фильтр по полю сидера
  //   filters.search — ILIKE-поиск по title/author (пользовательский запрос)
  // keyword из аргумента имеет приоритет над filters.keyword: вызывающий код
  // передаёт его явно сразу после setFilters, не дожидаясь обновления стейта
  fetchArticles: async (keyword?: string) => {
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
      set({ articles: sorted, total: data.total, isLoading: false });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load articles';
      set({ error: message, isLoading: false });
    }
  },

  // Обновляем серверные фильтры и сбрасываем на первую страницу
  setFilters: (newFilters: Partial<ArticleFilters>) => {
    set((state) => ({
      filters: { ...state.filters, ...newFilters },
      page: 1,
    }));
  },

  // Обновляем текущую страницу
  setPage: (page: number) => set({ page }),

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

  // Live-поиск через Scopus API; сохраняем квоту из заголовков ответа
  searchScopusLive: async (keyword: string) => {
    set({ isLiveSearching: true, error: null });
    try {
      const { articles, quota } = await findArticles(keyword, 25);
      set({
        liveResults: articles,
        scopusQuota: quota,
        isLiveSearching: false,
      });
      // Синхронизируем quotaStore после live-поиска — ScopusQuotaBadge
      // читает именно оттуда; articleStore.scopusQuota — локальная копия для обратной совместимости
      if (quota) {
        const { useQuotaStore } = await import('./quotaStore');
        useQuotaStore.setState({
          quota: { remaining: quota.remaining, limit: quota.limit },
        });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Live search failed';
      set({ error: message, isLiveSearching: false });
    }
  },
}));
