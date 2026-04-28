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

// Клиентская сортировка по цитированиям (сортед within current page — §4.1)
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
    // Поля стора для анонимной пагинации
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
    // Поля стора для авторизованной пагинации (добавлены в коммите 1)
    liveSize,
    setLiveSize,
  } = useArticleStore();

  const [sortBy, setSortBy] = useState<'date' | 'citations'>('date');
  const [hasSearched, setHasSearched] = useState(false);
  const [searchStats, setSearchStats] = useState<SearchStatsResponse | null>(null);
  const [isStatsLoading, setIsStatsLoading] = useState(false);

  // livePage живёт в useState: эфемерное UI-состояние без сайд-эффектов на стор.
  // Сбрасывается в 1 при каждом новом поиске и при смене liveSize
  const [livePage, setLivePage] = useState(1);

  useEffect(() => {
    if (!error || !isAuthenticated) return;
    if (error === 'QUOTA_EXCEEDED') {
      toast.error('Недельный лимит поиска исчерпан');
    } else {
      toast.error(`Ошибка поиска: ${error}`);
    }
  }, [error, isAuthenticated]);

  // Для авторизованных — live-результаты из Scopus, для анонимных — локальная коллекция
  const displayArticles = isAuthenticated ? liveResults : articles;

  // Сортировка применяется ко всему массиву до слайса, чтобы смена сортировки
  // не конфликтовала со сменой страницы
  const sortedArticles = useMemo(
    () => sortArticles(displayArticles, sortBy),
    [displayArticles, sortBy],
  );

  // Срез sortedArticles для текущей страницы/режима в авторизованной зоне.
  // В анонимном режиме не используется — передаётся sortedArticles напрямую
  const visibleLiveResults = useMemo(() => {
    if (!isAuthenticated) return sortedArticles;
    if (liveSize === 'all') return sortedArticles;
    const from = (livePage - 1) * 10;
    return sortedArticles.slice(from, from + 10);
  }, [isAuthenticated, sortedArticles, liveSize, livePage]);

  // Обработчики для анонимной зоны — fetchArticles явно после мутации стора
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
      // Новый запрос — всегда возвращаемся на первую страницу
      setLivePage(1);
      void searchScopusLive(query);

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
      // setFilters сбрасывает page=1 и articles=[] автоматически (коммит 1)
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
                articles={sortedArticles}
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
          {/* SearchBar + quota badge */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="flex-1 w-full">
              <SearchBar onSearch={handleSearch} />
            </div>
            <ScopusQuotaBadge />
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Поиск по базе Scopus — до 25 статей за запрос.{' '}
            Поиск по тематической коллекции{' '}
            <span className="font-medium text-slate-700 dark:text-slate-300">
              AI &amp; Neural Network Technologies
            </span>{' '}
            доступен в режиме{' '}
            <span className="font-medium text-slate-700 dark:text-slate-300">
              Коллекция
            </span>{' '}
            (в разработке).
          </p>

          <div className="flex gap-6 items-start">
            <div className="flex-1 min-w-0 flex flex-col gap-4">
              {/* Авторизованный режим: ArticleList отображает видимый срез.
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

              {/* ScopusPaginationBar: total = весь sortedArticles, не только срез */}
              <ScopusPaginationBar
                livePage={livePage}
                liveSize={liveSize}
                total={sortedArticles.length}
                onPageChange={setLivePage}
                onSizeChange={handleLiveSizeChange}
              />
            </div>
          </div>

          {filters.search && isStatsLoading && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-64 w-full rounded-xl" />
              ))}
            </div>
          )}
          {filters.search && searchStats && searchStats.total > 0 && (
            <SearchResultsDashboard stats={searchStats} query={filters.search} />
          )}
        </div>
      )}
    </div>
  );
}
