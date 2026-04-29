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
import { ErrorBoundary } from '../components/ui/ErrorBoundary';
import type { PageSize } from '../components/articles/PaginationBar';
import type { LiveSize } from '../components/articles/ScopusPaginationBar';
import type { ArticleResponse, SearchStatsResponse } from '../types/api';

// Client-side sort by citations (applied to the full array before slicing)
function sortArticles(
  articles: ArticleResponse[],
  sortBy: 'date' | 'citations',
): ArticleResponse[] {
  if (sortBy === 'date') return articles;
  return [...articles].sort(
    (a, b) => (b.cited_by_count ?? 0) - (a.cited_by_count ?? 0),
  );
}

// Anonymous hero block — search bar + CTA to register
function AnonHero({ onSearch }: { onSearch: (q: string) => void }) {
  return (
    <div className="mx-auto max-w-screen-sm px-4 py-16 flex flex-col items-center gap-6 text-center">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          Search Scopus Publications
        </h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          Preview results below.{' '}
          <Link to="/auth" className="text-blue-800 dark:text-blue-400 hover:underline">
            Sign in
          </Link>
          {' '}for full search access.
        </p>
      </div>
      <div className="w-full max-w-md">
        <SearchBar onSearch={onSearch} />
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400 text-center max-w-md">
        Unauthenticated search is scoped to the thematic collection
        &ldquo;Artificial Intelligence and Neural Network Technologies&rdquo;.
        To search the global Scopus database, please{' '}
        <Link to="/auth" className="text-blue-800 dark:text-blue-400 hover:underline">
          sign in
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
    // Store fields for anonymous / catalog pagination
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
    // Store fields for authenticated Scopus pagination
    liveSize,
    setLiveSize,
  } = useArticleStore();

  const [sortBy, setSortBy] = useState<'date' | 'citations'>('date');
  const [hasSearched, setHasSearched] = useState(false);
  const [searchStats, setSearchStats] = useState<SearchStatsResponse | null>(null);
  const [isStatsLoading, setIsStatsLoading] = useState(false);

  // livePage — ephemeral UI state, lives outside the store;
  // reset on every new Scopus search and on liveSize change
  const [livePage, setLivePage] = useState(1);

  // Search mode switcher for authenticated users:
  //   'scopus'  — live search against the global Scopus database (up to 25 results)
  //   'catalog' — search within the thematic collection AI & Neural Network Technologies
  // Default 'scopus' — the primary authenticated user flow.
  // On logout the component unmounts; useState resets on next login
  const [searchMode, setSearchMode] = useState<'scopus' | 'catalog'>('scopus');

  useEffect(() => {
    if (!error || !isAuthenticated) return;
    if (error === 'QUOTA_EXCEEDED') {
      toast.error('Weekly search quota exceeded');
    } else {
      toast.error(`Search error: ${error}`);
    }
  }, [error, isAuthenticated]);

  // Sort live results (Scopus mode): applied to the full array before slicing
  // so changing sortBy does not conflict with page changes
  const sortedLiveArticles = useMemo(
    () => sortArticles(liveResults, sortBy),
    [liveResults, sortBy],
  );

  // Sort catalog articles (catalog mode and anonymous mode):
  // articles — server page from the store, already filtered
  const sortedCatalogArticles = useMemo(
    () => sortArticles(articles, sortBy),
    [articles, sortBy],
  );

  // Slice of sortedLiveArticles for the current page in Scopus mode.
  // Not used in catalog / anonymous modes
  const visibleLiveResults = useMemo(() => {
    if (liveSize === 'all') return sortedLiveArticles;
    const from = (livePage - 1) * 10;
    return sortedLiveArticles.slice(from, from + 10);
  }, [sortedLiveArticles, liveSize, livePage]);

  // Handlers for anonymous and catalog modes (reused without duplication)
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

  // liveSize change handler: setLiveSize + reset livePage to 1
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
        // Live Scopus search — every new query resets livePage to 1
        setLivePage(1);
        void searchScopusLive(query);

        // Query stats — Scopus mode only; fire-and-forget
        setIsStatsLoading(true);
        setSearchStats(null);
        try {
          const stats = await getSearchStats(query);
          setSearchStats(stats);
        } catch {
          // Stats error does not block the list — silently swallow
        } finally {
          setIsStatsLoading(false);
        }
      } else {
        // Thematic collection search: same path as anonymous
        setFilters({ search: query, keyword: undefined });
        fetchArticles();
      }
    } else {
      // Anonymous mode: setFilters auto-resets page=1 and articles=[]
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
              {/* Anonymous mode: ArticleList изолирован в ErrorBoundary */}
              <ErrorBoundary>
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
              </ErrorBoundary>
            </div>
          )}
        </div>
      ) : (
        <div className="mx-auto max-w-screen-xl px-4 py-6 flex flex-col gap-4">

          {/* Search mode switcher */}
          <div
            role="group"
            aria-label="Search mode"
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
              Search Scopus Database
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
              Search AI &amp; Neural Network Technologies Collection
            </button>
          </div>

          {/* SearchBar + quota badge (badge shown in Scopus mode only) */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="flex-1 w-full">
              <SearchBar onSearch={handleSearch} />
            </div>
            {searchMode === 'scopus' && <ScopusQuotaBadge />}
          </div>

          {searchMode === 'scopus' ? (
            <div className="flex gap-6 items-start">
              <div className="flex-1 min-w-0 flex flex-col gap-4">
                {/* Scopus mode: ArticleList изолирован в ErrorBoundary;
                    ScopusPaginationBar вне boundary — pagination всегда видима */}
                <ErrorBoundary>
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
                </ErrorBoundary>

                {/* ScopusPaginationBar: total = entire sortedLiveArticles, not just the slice */}
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
              {/* Catalog mode: ArticleList изолирован в ErrorBoundary */}
              <ErrorBoundary>
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
              </ErrorBoundary>
            </div>
          )}

          {/* SearchResultsDashboard — Scopus mode only */}
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
