import { ArticleCard } from '../articles/ArticleCard';
import type { ArticleResponse } from '../../types/api';

interface SearchResultsListProps {
  articles: ArticleResponse[];
}

// Лёгкая обёртка над найденными статьями одного прошлого поиска
// (docs/personal-search-data/spec.md §3). Намеренно НЕ ArticleList — тот тянет
// ArticleFiltersSidebar/ArticleFiltersMobile/PaginationBar, инфраструктуру
// живого поиска по каталогу, лишнюю для статичного просмотра ≤25 статей.
// Lazy-импортируется из SearchHistoryList.tsx — не должен попасть в основной
// чанк ProfilePage.
export function SearchResultsList({ articles }: SearchResultsListProps) {
  return (
    <div className="flex flex-col gap-3">
      {articles.map((article) => (
        <ArticleCard key={article.id} article={article} />
      ))}
    </div>
  );
}
