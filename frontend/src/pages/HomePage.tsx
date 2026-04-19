import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useArticleStore } from '../stores/articleStore';
import { getSearchStats } from '../api/articles';
import { SearchBar } from '../components/search/SearchBar';
import { ArticleList } from '../components/articles/ArticleList';
import { ArticleFilters } from '../components/articles/ArticleFilters';
import { ScopusQuotaBadge } from '../components/articles/ScopusQuotaBadge';
import { PaginationControls } from '../components/ui/PaginationControls';
import { SearchResultsDashboard } from '../components/search/SearchResultsDashboard';
import { Skeleton } from '../components/ui/skeleton';
import { usePagination } from '../hooks/usePagination';
import type { ArticleResponse, SearchStatsResponse } from '../types/api';

const PAGE_SIZE = 20;

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

// Применяем активные фильтры client-side поверх данных страницы
function applyClientFilters(
  articles: ArticleResponse[],
  docTypes: string[] | undefined,
  openAccessOnly: boolean | undefined,
  countries: string[] | undefined,
  yearFrom: number | undefined,
  yearTo: number | undefined,
): ArticleResponse[] {
  return articles.filter((a) => {
    if (docTypes?.length && !docTypes.includes(a.document_type ?? '')) return false;
    if (openAccessOnly && a.open_access !== true) return false;
    if (countries?.length && !countries.includes(a.affiliation_country ?? '')) return false;
    if (yearFrom && a.publication_date) {
      const y = parseInt(a.publication_date.slice(0, 4), 10);
      if (y < yearFrom) return false;
    }
    if (yearTo && a.publication_date) {
      const y = parseInt(a.publication_date.slice(0, 4), 10);
      if (y > yearTo) return false;
    }
    return true;
  });
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
    </div>
  );
}

// Блок результатов + сайдбар фильтров для авторизованных
export default function HomePage() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { articles, isLoading, filters, setFilters, fetchArticles } = useArticleStore();
  const [sortBy, setSortBy] = useState<'date' | 'citations'>('date');

  // Флаг: пользователь выполнил хотя бы один поиск; предотвращает empty state
  // до поиска и показывает скелетон во время загрузки
  const [hasSearched, setHasSearched] = useState(false);

  // Состояние статистики поиска (только для авторизованных)
  const [searchStats, setSearchStats] = useState<SearchStatsResponse | null>(null);
  const [isStatsLoading, setIsStatsLoading] = useState(false);

  // Локальная страница для client-side пагинации по отфильтрованным данным
  const [currentPage, setCurrentPage] = useState(1);

  // Применяем client-side фильтры поверх данных страницы
  const filteredArticles = useMemo(
    () =>
      applyClientFilters(
        articles,
        filters.docTypes,
        filters.openAccessOnly,
        filters.countries,
        filters.yearFrom,
        filters.yearTo,
      ),
    [articles, filters],
  );

  // Сортировка после фильтрации
  const sortedArticles = useMemo(
    () => sortArticles(filteredArticles, sortBy),
    [filteredArticles, sortBy],
  );

  // Client-side нарезка на страницы
  const pageItems = useMemo(
    () => sortedArticles.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [sortedArticles, currentPage],
  );

  // usePagination по реальной сигнатуре: (total, page, size)
  const { totalPages } = usePagination(sortedArticles.length, currentPage, PAGE_SIZE);

  // Обработчик поиска:
  //   - пишет search (ILIKE), не keyword (фильтр по сидеру)
  //   - для авторизованных параллельно запрашивает статистику поиска
  //   - ошибка статистики не блокирует список статей
  async function handleSearch(query: string) {
    setHasSearched(true);
    // search — пользовательский запрос; keyword: undefined — сбрасываем фильтр сидера
    setFilters({ search: query, keyword: undefined });
    setCurrentPage(1);
    // Zustand set() синхронен — к моменту fetchArticles() стейт уже обновлен
    fetchArticles();

    // Для авторизованных: параллельный запрос статистики
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
        // Анонимный режим: hero + результаты без фильтров и пагинации
        <div className="flex flex-col">
          <AnonHero onSearch={handleSearch} />
          {/* ArticleList рендерится только после первого поиска;
               компонент сам управляет скелетоном и empty state */}
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
        // Авторизованный режим: SearchBar + sidebar + сетка статей + пагинация + дашборд
        <div className="mx-auto max-w-screen-xl px-4 py-6 flex flex-col gap-4">
          {/* SearchBar + quota badge */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="flex-1 w-full">
              <SearchBar onSearch={handleSearch} />
            </div>
            <ScopusQuotaBadge />
          </div>

          {/* Мобильная кнопка фильтров */}
          <div className="lg:hidden">
            <ArticleFilters />
          </div>

          {/* sidebar + сетка */}
          <div className="flex gap-6 items-start">
            {/* Desktop sidebar */}
            <div className="hidden lg:block">
              <ArticleFilters />
            </div>

            {/* Список статей + пагинация */}
            <div className="flex-1 min-w-0 flex flex-col gap-4">
              <ArticleList
                articles={pageItems}
                isLoading={isLoading}
                sortBy={sortBy}
                onSortChange={setSortBy}
              />
              {totalPages > 1 && (
                <PaginationControls
                  page={currentPage}
                  totalPages={totalPages}
                  onPageChange={setCurrentPage}
                  total={sortedArticles.length}
                  size={PAGE_SIZE}
                />
              )}
            </div>
          </div>

          {/* Дашборд поисковой аналитики:
               - показываем скелетон пока статистика загружается
               - дашборд не показываем при stats.total === 0 */}
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
