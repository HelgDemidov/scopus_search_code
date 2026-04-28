import { useState, useMemo, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuthStore } from '../stores/authStore';
import { useArticleStore } from '../stores/articleStore';
import { getSearchStats } from '../api/articles';
import { SearchBar } from '../components/search/SearchBar';
import { ArticleList } from '../components/articles/ArticleList';
import { ScopusQuotaBadge } from '../components/articles/ScopusQuotaBadge';
import { ScopusPaginationBar } from '../components/articles/ScopusPaginationBar';
import { SearchResultsDashboard } from '../components/search/SearchResultsDashboard';
import { Skeleton } from '../components/ui/skeleton';
import type { PageSize } from '../components/articles/PaginationBar';
import type { LiveSize } from '../components/articles/ScopusPaginationBar';
import type { ArticleResponse, SearchStatsResponse } from '../types/api';

// Клиентская сортировка по цитированиям (применяется ко всему массиву до слайса)
function sortArticles(
  articles: ArticleResponse[],
  sortBy: 'date' | 'citations',
): ArticleResponse[] {
  if (sortBy === 'date') return articles;
  return [...articles].sort(
    (a, b) => (b.cited_by_count ?? 0) - (a.cited_by_count ?? 0),
  );
}

// Анонимный hero-блок — поисковая строка + CTA зарегистрироваться
function AnonHero({ onSearch }: { onSearch: (q: string) => void }) {
  return (
    <div className="mx-auto max-w-screen-sm px-4 py-16 flex flex-col items-center gap-6 text-center">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          Поиск публикаций Scopus
        </h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          Предпросмотр результатов ниже.{' '}
          <Link to="/auth" className="text-blue-800 dark:text-blue-400 hover:underline">
            Войдите
          </Link>
          {' '}для полного поиска.
        </p>
      </div>
      <div className="w-full max-w-md">
        <SearchBar onSearch={onSearch} />
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400 text-center max-w-md">
        Поиск без авторизации осуществляется по статьям тематической коллекции
        «Артифициальный интеллект и технологии нейронных сетей».
        Для поиска по глобальной базе Scopus пройдите{' '}
        <Link to="/auth" className="text-blue-800 dark:text-blue-400 hover:underline">
          авторизацию
        </Link>.
      </p>
    </div>
  );
}

export default function HomePage() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const {
    articles,
    liveResults,
    isLoading,
    isLiveSearching,
    error,
    filters,
    // Поля стора для анонимной / каталожной пагинации
    page,
    size,
    total,
    appendMode,
    setFilters,
    fetchArticles,
    setPage,
    setSize,
    setAppendMode,
    searchScopusLive,
    // Поля стора для авторизованной Scopus-пагинации
    liveSize,
    setLiveSize,
  } = useArticleStore();

  const [sortBy, setSortBy] = useState<'date' | 'citations'>('date');
  const [hasSearched, setHasSearched] = useState(false);
  const [searchStats, setSearchStats] = useState<SearchStatsResponse | null>(null);
  const [isStatsLoading, setIsStatsLoading] = useState(false);

  // livePage — эфемерное UI-состояние, живёт вне стора;
  // сбрасывается при каждом новом Scopus-поиске и при смене liveSize
  const [livePage, setLivePage] = useState(1);

  // Переключатель режима поиска для авторизованных пользователей:
  //   'scopus'  — живой поиск по глобальной базе Scopus (до 25 результатов)
  //   'catalog' — поиск по тематической коллекции AI & Neural Network Technologies
  // Дефолт 'scopus' — основной сценарий авторизованного пользователя.
  // При logout компонент размонтируется, при следующем логине useState сбросится
  const [searchMode, setSearchMode] = useState<'scopus' | 'catalog'>('scopus');

  useEffect(() => {
    if (!error || !isAuthenticated) return;
    if (error === 'QUOTA_EXCEEDED') {
      toast.error('Недельный лимит поиска исчерпан');
    } else {
      toast.error(`Ошибка поиска: ${error}`);
    }
  }, [error, isAuthenticated]);

  // Сортировка live-результатов (Scopus-режим): применяется ко всему массиву до слайса,
  // чтобы смена sortBy не конфликтовала со сменой страницы
  const sortedLiveArticles = useMemo(
    () => sortArticles(liveResults, sortBy),
    [liveResults, sortBy],
  );

  // Сортировка статей каталога (catalog-режим и анонимный режим):
  // articles — серверная страница из стора, уже отфильтрованная
  const sortedCatalogArticles = useMemo(
    () => sortArticles(articles, sortBy),
    [articles, sortBy],
  );

  // Срез sortedLiveArticles для текущей страницы в Scopus-режиме.
  // В catalog/анонимном режимах не используется
  const visibleLiveResults = useMemo(() => {
    if (liveSize === 'all') return sortedLiveArticles;
    const from = (livePage - 1) * 10;
    return sortedLiveArticles.slice(from, from + 10);
  }, [sortedLiveArticles, liveSize, livePage]);

  // Обработчики для анонимного и каталожного режима (переиспользуются без дублирования)
  const handlePageChange = useCallback(
    (p: number) => {
      setPage(p);
      fetchArticles();
    },
    [setPage, fetchArticles],
  );

  const handleSizeChange = useCallback(
    (s: PageSize) => {
      setSize(s);
      fetchArticles();
    },
    [setSize, fetchArticles],
  );

  const handleToggleMode = useCallback(() => {
    setAppendMode(!appendMode);
  }, [setAppendMode, appendMode]);

  // Обработчик смены liveSize: setLiveSize + сброс livePage в 1
  const handleLiveSizeChange = useCallback(
    (s: LiveSize) => {
      setLiveSize(s);
      setLivePage(1);
    },
    [setLiveSize],
  );

  async function handleSearch(query: string) {
    setHasSearched(true);

    if (isAuthenticated) {
      if (searchMode === 'scopus') {
        // Живой поиск по Scopus — новый запрос всегда сбрасывает livePage в 1
        setLivePage(1);
        void searchScopusLive(query);

        // Статистика запроса — только в Scopus-режиме; fire-and-forget
        setIsStatsLoading(true);
        setSearchStats(null);
        try {
          const stats = await getSearchStats(query);
          setSearchStats(stats);
        } catch {
          // Ошибка статистики не блокирует список — тихо проглатываем
        } finally {
          setIsStatsLoading(false);
        }
      } else {
        // Поиск по тематической коллекции: тот же путь, что у анонима
        setFilters({ search: query, keyword: undefined });
        fetchArticles();
      }
    } else {
      // Анонимный режим: setFilters сбрасывает page=1 и articles=[] автоматически
      setFilters({ search: query, keyword: undefined });
      fetchArticles();
    }
  }

  return (
    <div className="min-h-[calc(100vh-3.5rem)]">
      {!isAuthenticated ? (
        <div className="flex flex-col">
          <AnonHero onSearch={handleSearch} />
          {hasSearched && (
            <div className="mx-auto w-full max-w-screen-lg px-4 pb-12">
              {/* Анонимный режим: полный wire-up пагинации через ArticleList/PaginationBar */}
              <ArticleList
                articles={sortedCatalogArticles}
                isLoading={isLoading}
                sortBy={sortBy}
                onSortChange={setSortBy}
                page={page}
                size={size}
                total={total}
                appendMode={appendMode}
                onPageChange={handlePageChange}
                onSizeChange={handleSizeChange}
                onToggleMode={handleToggleMode}
              />
            </div>
          )}
        </div>
      ) : (
        <div className="mx-auto max-w-screen-xl px-4 py-6 flex flex-col gap-4">

          {/* Переключатель режима поиска */}
          <div
            role="group"
            aria-label="Режим поиска"
            className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden self-start"
          >
            <button
              aria-pressed={searchMode === 'scopus'}
              onClick={() => setSearchMode('scopus')}
              className={
                'px-4 py-2 text-sm font-medium transition-colors ' +
                (searchMode === 'scopus'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800')
              }
            >
              Поиск по базе Scopus
            </button>
            <button
              aria-pressed={searchMode === 'catalog'}
              onClick={() => setSearchMode('catalog')}
              className={
                'px-4 py-2 text-sm font-medium transition-colors border-l border-slate-200 dark:border-slate-700 ' +
                (searchMode === 'catalog'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800')
              }
            >
              Поиск по коллекции AI &amp; Neural Network Technologies
            </button>
          </div>

          {/* SearchBar + quota badge (только в Scopus-режиме нужен badge) */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="flex-1 w-full">
              <SearchBar onSearch={handleSearch} />
            </div>
            {searchMode === 'scopus' && <ScopusQuotaBadge />}
          </div>

          {searchMode === 'scopus' ? (
            <div className="flex gap-6 items-start">
              <div className="flex-1 min-w-0 flex flex-col gap-4">
                {/* Scopus-режим: ArticleList отображает видимый срез.
                    Пагинацией управляет ScopusPaginationBar, а не ArticleList/PaginationBar */}
                <ArticleList
                  articles={visibleLiveResults}
                  isLoading={isLiveSearching}
                  sortBy={sortBy}
                  onSortChange={setSortBy}
                  page={1}
                  size={25}
                  total={visibleLiveResults.length}
                  appendMode={false}
                  onPageChange={() => {}}
                  onSizeChange={() => {}}
                  onToggleMode={() => {}}
                />

                {/* ScopusPaginationBar: total = весь sortedLiveArticles, не только срез */}
                <ScopusPaginationBar
                  livePage={livePage}
                  liveSize={liveSize}
                  total={sortedLiveArticles.length}
                  onPageChange={setLivePage}
                  onSizeChange={handleLiveSizeChange}
                />
              </div>
            </div>
          ) : (
            <div className="flex-1 min-w-0">
              {/* Catalog-режим: те же ArticleList/PaginationBar и handlers, что у анонима.
                  articles и total — из стора (серверная пагинация GET /articles/) */}
              <ArticleList
                articles={sortedCatalogArticles}
                isLoading={isLoading}
                sortBy={sortBy}
                onSortChange={setSortBy}
                page={page}
                size={size}
                total={total}
                appendMode={appendMode}
                onPageChange={handlePageChange}
                onSizeChange={handleSizeChange}
                onToggleMode={handleToggleMode}
              />
            </div>
          )}

          {/* SearchResultsDashboard — только в Scopus-режиме */}
          {searchMode === 'scopus' && filters.search && isStatsLoading && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-64 w-full rounded-xl" />
              ))}
            </div>
          )}
          {searchMode === 'scopus' && filters.search && searchStats && searchStats.total > 0 && (
            <SearchResultsDashboard stats={searchStats} query={filters.search} />
          )}
        </div>
      )}
    </div>
  );
}
