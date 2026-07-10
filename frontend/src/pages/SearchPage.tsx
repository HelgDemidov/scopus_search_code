import { useState, useMemo, useEffect, useCallback } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useAuthStore } from '../stores/authStore';
import { useArticleStore } from '../stores/articleStore';
import { SearchBar } from '../components/search/SearchBar';
import { LocalizedLink } from '../components/layout/LocalizedLink';
import { ArticleList } from '../components/articles/ArticleList';
import { ScopusQuotaBadge } from '../components/articles/ScopusQuotaBadge';
import { ScopusPaginationBar } from '../components/articles/ScopusPaginationBar';
import { ErrorBoundary } from '../components/ui/ErrorBoundary';
import { useHreflangTags } from '../hooks/useHreflangTags';
import type { PageSize } from '../components/articles/PaginationBar';
import type { LiveSize } from '../components/articles/ScopusPaginationBar';
import type { ArticleResponse } from '../types/api';

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

// Анонимный hero-блок — строка поиска + CTA для регистрации
function AnonHero({ onSearch }: { onSearch: (q: string) => void }) {
  const { t } = useTranslation();
  return (
    <div className="mx-auto max-w-screen-sm px-4 py-16 flex flex-col items-center gap-6 text-center">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          {t('searchPage.anonTitle')}
        </h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          <Trans
            i18nKey="searchPage.anonSubtitle"
            components={{ lnk: <LocalizedLink to="/auth" className="text-blue-800 dark:text-blue-400 hover:underline" /> }}
          />
        </p>
      </div>
      <div className="w-full max-w-md">
        <SearchBar onSearch={onSearch} />
      </div>
      <p className="text-sm text-slate-500 dark:text-slate-400 text-center max-w-md">
        <Trans
          i18nKey="searchPage.anonNote"
          components={{ lnk: <LocalizedLink to="/auth" className="text-blue-800 dark:text-blue-400 hover:underline" /> }}
        />
      </p>
    </div>
  );
}

export default function SearchPage() {
  const hreflangTags = useHreflangTags('/search');
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const {
    articles,
    liveResults,
    isLoading,
    isLiveSearching,
    error,
    // filters не деструктурируется: handleSearch использует только setFilters,
    // прямое чтение filters в компоненте не требуется
    page,
    size,
    total,
    totalIsCapped,
    appendMode,
    setFilters,
    fetchArticles,
    setPage,
    setSize,
    setAppendMode,
    searchScopusLive,
    // Режим поиска и ключевое слово — подняты из local useState в стор (Шаг 4)
    searchMode,
    setSearchMode,
    setCurrentKeyword,
    currentKeyword,
    resetKey,
    // Поля стора для аутентифицированной Scopus-пагинации
    liveSize,
    setLiveSize,
  } = useArticleStore();

  const { t } = useTranslation();
  const [sortBy, setSortBy] = useState<'date' | 'citations'>('date');
  const [hasSearched, setHasSearched] = useState(false);

  // livePage — эфемерное UI-состояние вне стора;
  // сбрасывается при каждом новом поиске и при смене liveSize
  const [livePage, setLivePage] = useState(1);

  useEffect(() => {
    if (!error || !isAuthenticated) return;
    if (error === 'QUOTA_EXCEEDED') {
      toast.error(t('searchPage.errorQuota'));
    } else {
      toast.error(t('searchPage.errorGeneric', { error }));
    }
  }, [error, isAuthenticated, t]);

  // Сброс hasSearched при resetSearch() — currentKeyword становится null
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (currentKeyword === null) setHasSearched(false);
  }, [currentKeyword]);

  // Сортировка live-результатов (режим Scopus): применяется ко всему массиву до слайса,
  // чтобы смена sortBy не конфликтовала с переключением страниц
  const sortedLiveArticles = useMemo(
    () => sortArticles(liveResults, sortBy),
    [liveResults, sortBy],
  );

  // Сортировка каталожных статей (режим catalog и анонимный режим):
  // articles — серверная страница из стора, уже отфильтрованная
  const sortedCatalogArticles = useMemo(
    () => sortArticles(articles, sortBy),
    [articles, sortBy],
  );

  // Срез sortedLiveArticles для текущей страницы в режиме Scopus.
  // В каталожном / анонимном режимах не используется
  const visibleLiveResults = useMemo(() => {
    if (liveSize === 'all') return sortedLiveArticles;
    const from = (livePage - 1) * 10;
    return sortedLiveArticles.slice(from, from + 10);
  }, [sortedLiveArticles, liveSize, livePage]);

  // Обработчики для анонимного и каталожного режимов (переиспользуются без дублирования)
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

  function handleSearch(query: string) {
    setHasSearched(true);
    setCurrentKeyword(query);

    if (isAuthenticated) {
      if (searchMode === 'scopus') {
        // Живой поиск Scopus — каждый новый запрос сбрасывает livePage в 1
        setLivePage(1);
        void searchScopusLive(query);
      } else {
        // Поиск по тематической коллекции: тот же путь, что и у анонима
        setFilters({ search: query, keyword: undefined });
        fetchArticles();
      }
    } else {
      // Анонимный режим: setFilters автоматически сбрасывает page=1 и articles=[]
      setFilters({ search: query, keyword: undefined });
      fetchArticles();
    }
  }

  return (
    <div className="min-h-[calc(100vh-3.5rem)]">
      {hreflangTags}
      {!isAuthenticated ? (
        <div className="flex flex-col">
          <AnonHero key={resetKey} onSearch={handleSearch} />
          {hasSearched && (
            <div className="mx-auto w-full max-w-screen-lg px-4 pb-12">
              {/* Анонимный режим: ArticleList изолирован в ErrorBoundary */}
              <ErrorBoundary>
                <ArticleList
                  articles={sortedCatalogArticles}
                  isLoading={isLoading}
                  hasSearched={hasSearched}
                  sortBy={sortBy}
                  onSortChange={setSortBy}
                  page={page}
                  size={size}
                  total={total}
                  totalIsCapped={totalIsCapped}
                  appendMode={appendMode}
                  onPageChange={handlePageChange}
                  onSizeChange={handleSizeChange}
                  onToggleMode={handleToggleMode}
                />
              </ErrorBoundary>
            </div>
          )}
        </div>
      ) : (
        <div className="mx-auto max-w-screen-xl px-4 py-6 flex flex-col gap-4">

          {/* Переключатель режима поиска */}
          <div
            role="group"
            aria-label={t('a11y.searchMode')}
            className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden self-start"
          >
            <button
              aria-pressed={searchMode === 'scopus'}
              onClick={() => setSearchMode('scopus')}
              className={
                'px-4 py-2 text-sm font-medium transition-colors ' +
                (searchMode === 'scopus'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white dark:bg-[#0c1927] text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800')
              }
            >
              {t('searchPage.modeScopus')}
            </button>
            <button
              aria-pressed={searchMode === 'catalog'}
              onClick={() => setSearchMode('catalog')}
              className={
                'px-4 py-2 text-sm font-medium transition-colors border-l border-slate-200 dark:border-slate-700 ' +
                (searchMode === 'catalog'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white dark:bg-[#0c1927] text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800')
              }
            >
              {t('searchPage.modeCatalog')}
            </button>
          </div>

          {/* SearchBar + бейдж квоты (бейдж отображается только в режиме Scopus) */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="flex-1 w-full">
              <SearchBar key={resetKey} onSearch={handleSearch} />
            </div>
            {searchMode === 'scopus' && <ScopusQuotaBadge />}
          </div>

          {searchMode === 'scopus' ? (
            <div className="flex gap-6 items-start">
              <div className="flex-1 min-w-0 flex flex-col gap-4">
                {/* Режим Scopus: ArticleList изолирован в ErrorBoundary;
                    ScopusPaginationBar вне boundary — пагинация всегда видима.
                    total передаётся как длина всего отсортированного массива,
                    чтобы счётчик "X results" отражал полный размер выборки,
                    а не только размер текущего среза visibleLiveResults */}
                <ErrorBoundary>
                  <ArticleList
                    articles={visibleLiveResults}
                    isLoading={isLiveSearching}
                    hasSearched={hasSearched}
                    sortBy={sortBy}
                    onSortChange={setSortBy}
                    page={1}
                    size={25}
                    total={sortedLiveArticles.length}
                    totalIsCapped={false}
                    appendMode={false}
                    onPageChange={() => {}}
                    onSizeChange={() => {}}
                    onToggleMode={() => {}}
                  />
                </ErrorBoundary>

                {/* ScopusPaginationBar: total = весь sortedLiveArticles, а не только срез */}
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
              {/* Режим каталога: ArticleList изолирован в ErrorBoundary */}
              <ErrorBoundary>
                <ArticleList
                  articles={sortedCatalogArticles}
                  isLoading={isLoading}
                  hasSearched={hasSearched}
                  sortBy={sortBy}
                  onSortChange={setSortBy}
                  page={page}
                  size={size}
                  total={total}
                  totalIsCapped={totalIsCapped}
                  appendMode={appendMode}
                  onPageChange={handlePageChange}
                  onSizeChange={handleSizeChange}
                  onToggleMode={handleToggleMode}
                />
              </ErrorBoundary>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
