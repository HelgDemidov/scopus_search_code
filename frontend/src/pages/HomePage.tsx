import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useArticleStore } from '../stores/articleStore';
import { SearchBar } from '../components/search/SearchBar';
import { ArticleList } from '../components/articles/ArticleList';
import { ArticleFilters } from '../components/articles/ArticleFilters';
import { ScopusQuotaBadge } from '../components/articles/ScopusQuotaBadge';
import { PaginationControls } from '../components/ui/PaginationControls';
import { usePagination } from '../hooks/usePagination';
import type { ArticleResponse } from '../types/api';

const PAGE_SIZE = 20;

// Клиентская сортировка по цитированиям (Sorted within current page — §4.1)
function sortArticles(
  articles: ArticleResponse[],
  sortBy: 'date' | 'citations',
): ArticleResponse[] {
  if (sortBy === 'date') return articles;
  return [...articles].sort(
    (a, b) => (b.cited_by_count ?? 0) - (a.cited_by_count ?? 0),
  );
}

// Применяем активные фильтры к client-side — по спеку фильтры серверные,
// но для UX без перезагрузки применяем их поверх на данных текущей страницы
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

  // Сброс на первую страницу при смене фильтров или сортировки
  function handleSearch(query: string) {
    setFilters({ keyword: query });
    setCurrentPage(1);
    fetchArticles(query);
  }

  return (
    <div className="min-h-[calc(100vh-3.5rem)]">
      {!isAuthenticated ? (
        // Анонимный режим: hero + результаты без фильтров и пагинации
        <div className="flex flex-col">
          <AnonHero onSearch={handleSearch} />
          {articles.length > 0 && (
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
        // Авторизованный режим: SearchBar + sidebar + сетка статей + пагинация
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
        </div>
      )}
    </div>
  );
}
