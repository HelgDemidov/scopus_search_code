import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useArticleStore } from '../stores/articleStore';
import { getSearchStats } from '../api/articles';
import { SearchBar } from '../components/search/SearchBar';
import { ArticleList } from '../components/articles/ArticleList';
import { ScopusQuotaBadge } from '../components/articles/ScopusQuotaBadge';
import { SearchResultsDashboard } from '../components/search/SearchResultsDashboard';
import { Skeleton } from '../components/ui/skeleton';
import type { ArticleResponse, SearchStatsResponse } from '../types/api';

// Клиентская сортировка по цитированиям (Сортед within current page — §4.1)
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
          Search Scopus publications
        </h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          Preview results below.{' '}
          <Link to="/auth" className="text-blue-800 dark:text-blue-400 hover:underline">
            Sign in
          </Link>
          {' '}to unlock full search.
        </p>
      </div>
      <div className="w-full max-w-md">
        <SearchBar onSearch={onSearch} />
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400 text-center max-w-md">
        Поиск без авторизации осуществляется по статьям тематической коллекции
        «Artificial Intelligence and Neural Network Technologies».
        Для поиска по глобальной базе Scopus пройдите{' '}
        <Link to="/auth" className="text-blue-800 dark:text-blue-400 hover:underline">
          авторизацию
        </Link>.
      </p>
    </div>
  );
}

// Блок результатов для авторизованных
export default function HomePage() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { articles, isLoading, filters, setFilters, fetchArticles } = useArticleStore();
  const [sortBy, setSortBy] = useState<'date' | 'citations'>('date');

  const [hasSearched, setHasSearched] = useState(false);

  const [searchStats, setSearchStats] = useState<SearchStatsResponse | null>(null);
  const [isStatsLoading, setIsStatsLoading] = useState(false);

  // Сортировка по текущим данным стора
  const sortedArticles = useMemo(
    () => sortArticles(articles, sortBy),
    [articles, sortBy],
  );

  async function handleSearch(query: string) {
    setHasSearched(true);
    setFilters({ search: query, keyword: undefined });
    fetchArticles();

    if (isAuthenticated) {
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
    }
  }

  return (
    <div className="min-h-[calc(100vh-3.5rem)]">
      {!isAuthenticated ? (
        <div className="flex flex-col">
          <AnonHero onSearch={handleSearch} />
          {hasSearched && (
            <div className="mx-auto w-full max-w-screen-lg px-4 pb-12">
              <ArticleList
                articles={sortedArticles}
                isLoading={isLoading}
                sortBy={sortBy}
                onSortChange={setSortBy}
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
            Выдача результатов поиска по живой базе Scopus ограничена 25 статьями за 1 запрос
          </p>

          <div className="flex gap-6 items-start">
            <div className="flex-1 min-w-0 flex flex-col gap-4">
              <ArticleList
                articles={sortedArticles}
                isLoading={isLoading}
                sortBy={sortBy}
                onSortChange={setSortBy}
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
