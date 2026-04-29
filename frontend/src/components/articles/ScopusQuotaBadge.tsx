import { useArticleStore } from '../../stores/articleStore';

/**
 * Displays the remaining Scopus API quota from the headers of the last /articles/find request.
 * Hidden until the first live request (scopusQuota === null).
 */
export function ScopusQuotaBadge() {
  const scopusQuota = useArticleStore((s) => s.scopusQuota);

  // Hide until the first live request per §4.1
  if (!scopusQuota) return null;

  // Color by fill ratio: red < 10%, yellow < 25%, otherwise green
  const ratio = scopusQuota.remaining / scopusQuota.limit;
  const colorClass =
    ratio < 0.1
      ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400'
      : ratio < 0.25
      ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400'
      : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400';

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${colorClass}`}
      title={`Scopus API quota: ${scopusQuota.remaining.toLocaleString('en-US')} of ${scopusQuota.limit.toLocaleString('en-US')}`}
    >
      {/* Pulse indicator */}
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-40" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current" />
      </span>
      Scopus quota: {scopusQuota.remaining.toLocaleString('en-US')} / {scopusQuota.limit.toLocaleString('en-US')}
    </span>
  );
}
