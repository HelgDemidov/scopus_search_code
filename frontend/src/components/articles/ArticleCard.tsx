import { Link } from 'react-router-dom';
import { Badge } from '../ui/badge';
import type { ArticleResponse } from '../../types/api';

interface ArticleCardProps {
  article: ArticleResponse;
}

// Format date: accepts YYYY-MM-DD or full ISO string, returns "Month YYYY"
function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
  } catch {
    return dateStr;
  }
}

export function ArticleCard({ article }: ArticleCardProps) {
  const {
    id,
    title,
    author,
    journal,
    publication_date,
    doi,
    cited_by_count,
    document_type,
    open_access,
    affiliation_country,
  } = article;

  return (
    <article
      className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 flex flex-col gap-3 hover:shadow-md transition-shadow"
      aria-label={title}
    >
      {/* Title */}
      <Link
        to={`/articles/${id}`}
        className="text-base font-semibold leading-snug text-slate-900 dark:text-slate-100 hover:text-blue-800 dark:hover:text-blue-400 transition-colors line-clamp-3"
      >
        {title}
      </Link>

      {/* Author + date */}
      <div className="text-sm text-slate-500 dark:text-slate-400 flex flex-wrap gap-x-3 gap-y-0.5">
        {author && <span>{author}</span>}
        {journal && <span className="italic">{journal}</span>}
        {publication_date && <span>{formatDate(publication_date)}</span>}
        {affiliation_country && <span>{affiliation_country}</span>}
      </div>

      {/* Badges row */}
      <div className="flex flex-wrap gap-2">
        {document_type && (
          <Badge variant="secondary">{document_type}</Badge>
        )}
        {open_access === true && (
          <Badge className="bg-emerald-700 text-white hover:bg-emerald-700 dark:bg-emerald-400 dark:text-slate-900">
            Open Access
          </Badge>
        )}
      </div>

      {/* Footer: citations + DOI */}
      <div className="flex items-center justify-between text-xs text-slate-400 dark:text-slate-500 pt-1 border-t border-slate-100 dark:border-slate-700">
        <span>
          {cited_by_count != null ? `Cited: ${cited_by_count}` : ''}
        </span>
        {doi && (
          <a
            href={`https://doi.org/${doi}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`DOI: ${doi}`}
            className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200 transition-colors truncate max-w-[55%]"
          >
            {doi}
          </a>
        )}
      </div>
    </article>
  );
}
