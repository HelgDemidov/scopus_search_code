import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getArticleById } from '../api/articles';
import type { ArticleResponse } from '../types/api';
import { Badge } from '../components/ui/badge';

// Global container for detail pages
function PageContainer({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-3xl mx-auto px-4 py-10">{children}</div>
  );
}

// Loading skeleton — mirrors the detail page structure
function ArticleSkeleton() {
  return (
    <PageContainer>
      {/* Back button */}
      <div className="h-4 w-24 rounded bg-slate-200 dark:bg-slate-700 mb-6 animate-pulse" />
      {/* Title */}
      <div className="h-7 w-3/4 rounded bg-slate-200 dark:bg-slate-700 mb-3 animate-pulse" />
      <div className="h-7 w-1/2 rounded bg-slate-200 dark:bg-slate-700 mb-6 animate-pulse" />
      {/* Metadata rows */}
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="h-4 w-full rounded bg-slate-100 dark:bg-slate-800 mb-3 animate-pulse" />
      ))}
    </PageContainer>
  );
}

// Date formatting: YYYY-MM-DD → "Month DD, YYYY"
function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

export default function ArticlePage() {
  const { id } = useParams<{ id: string }>();

  // Three states: loading → data or notFound
  const [article, setArticle] = useState<ArticleResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    // id comes from the URL always as a string; verify it is a valid positive integer
    const numericId = Number(id);
    if (!id || isNaN(numericId) || numericId < 1) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    setLoading(true);
    setNotFound(false);

    getArticleById(numericId)
      .then((data) => {
        setArticle(data);
      })
      .catch((err) => {
        // 404 from backend — article not found
        if (err?.response?.status === 404) {
          setNotFound(true);
        } else {
          // Other errors (network, 500) — show the same 404 screen
          setNotFound(true);
        }
      })
      .finally(() => {
        setLoading(false);
      });
  }, [id]);

  // Loading state
  if (loading) {
    return <ArticleSkeleton />;
  }

  // Article not found or invalid id
  if (notFound || !article) {
    return (
      <PageContainer>
        <Link
          to="/"
          className="text-sm text-slate-500 hover:text-blue-700 dark:text-slate-400 dark:hover:text-blue-400 flex items-center gap-1 mb-6 transition-colors"
        >
          &larr; Back to home
        </Link>
        <div className="text-center py-16">
          <p className="text-5xl mb-4">🔍</p>
          <h1 className="text-xl font-semibold text-slate-800 dark:text-slate-200 mb-2">
            Article not found
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            The article may have been removed or the URL is incorrect.
          </p>
        </div>
      </PageContainer>
    );
  }

  // Main content — article data
  return (
    <PageContainer>
      {/* Back button */}
      <Link
        to="/"
        className="text-sm text-slate-500 hover:text-blue-700 dark:text-slate-400 dark:hover:text-blue-400 flex items-center gap-1 mb-6 transition-colors"
      >
        &larr; Back to home
      </Link>

      {/* Title */}
      <h1 className="text-xl font-semibold leading-snug text-slate-900 dark:text-slate-100 mb-4">
        {article.title}
      </h1>

      {/* Badges: type, OA */}
      <div className="flex flex-wrap gap-2 mb-5">
        {article.document_type && (
          <Badge variant="secondary">{article.document_type}</Badge>
        )}
        {article.open_access === true && (
          <Badge className="bg-emerald-700 text-white hover:bg-emerald-700 dark:bg-emerald-400 dark:text-slate-900">
            Open Access
          </Badge>
        )}
        {article.keyword && (
          <Badge variant="outline">{article.keyword}</Badge>
        )}
      </div>

      {/* Metadata table */}
      <dl className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">

        {article.author && (
          <div className="py-2.5 flex gap-4">
            <dt className="w-40 shrink-0 text-slate-500 dark:text-slate-400">Author</dt>
            <dd className="text-slate-900 dark:text-slate-100">{article.author}</dd>
          </div>
        )}

        {article.journal && (
          <div className="py-2.5 flex gap-4">
            <dt className="w-40 shrink-0 text-slate-500 dark:text-slate-400">Journal</dt>
            <dd className="text-slate-900 dark:text-slate-100 italic">{article.journal}</dd>
          </div>
        )}

        <div className="py-2.5 flex gap-4">
          <dt className="w-40 shrink-0 text-slate-500 dark:text-slate-400">Date</dt>
          <dd className="text-slate-900 dark:text-slate-100">{formatDate(article.publication_date)}</dd>
        </div>

        {article.affiliation_country && (
          <div className="py-2.5 flex gap-4">
            <dt className="w-40 shrink-0 text-slate-500 dark:text-slate-400">Country</dt>
            <dd className="text-slate-900 dark:text-slate-100">{article.affiliation_country}</dd>
          </div>
        )}

        {article.cited_by_count != null && (
          <div className="py-2.5 flex gap-4">
            <dt className="w-40 shrink-0 text-slate-500 dark:text-slate-400">Citations</dt>
            <dd className="text-slate-900 dark:text-slate-100">{article.cited_by_count}</dd>
          </div>
        )}

        {article.doi && (
          <div className="py-2.5 flex gap-4">
            <dt className="w-40 shrink-0 text-slate-500 dark:text-slate-400">DOI</dt>
            <dd>
              <a
                href={`https://doi.org/${article.doi}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-700 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-200 break-all transition-colors"
              >
                {article.doi}
              </a>
            </dd>
          </div>
        )}

      </dl>
    </PageContainer>
  );
}
