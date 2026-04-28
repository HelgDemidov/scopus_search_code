import { useQuotaStore } from '../../stores/quotaStore';
import { Skeleton } from '../ui/skeleton';

// Quota state severity: normal / warning / exceeded
type Severity = 'ok' | 'warning' | 'exceeded';

function getSeverity(used: number, limit: number): Severity {
  const ratio = used / limit;
  if (ratio >= 1) return 'exceeded';
  if (ratio >= 0.8) return 'warning';
  return 'ok';
}

const severityClasses: Record<Severity, string> = {
  ok: 'text-emerald-700 dark:text-emerald-400',
  warning: 'text-amber-600 dark:text-amber-400',
  exceeded: 'text-rose-600 dark:text-rose-400',
};

export function LiveSearchQuotaCounter() {
  const { quota, isLoading } = useQuotaStore();

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5">
      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">
        Scopus Live Search — Weekly Quota
      </p>

      {isLoading || !quota ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-2 w-full" />
        </div>
      ) : (
        () => {
          const severity = getSeverity(quota.used, quota.limit);
          const pct = Math.min(100, Math.round((quota.used / quota.limit) * 100));
          return (
            <div className="flex flex-col gap-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500 dark:text-slate-400">Used</span>
                <span className={`font-semibold tabular-nums ${severityClasses[severity]}`}>
                  {quota.used} / {quota.limit}
                </span>
              </div>
              {/* Progress bar */}
              <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                <div
                  role="progressbar"
                  aria-valuenow={pct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  style={{ width: `${pct}%` }}
                  className={
                    'h-full rounded-full transition-all ' +
                    (severity === 'exceeded'
                      ? 'bg-rose-500'
                      : severity === 'warning'
                      ? 'bg-amber-500'
                      : 'bg-emerald-500')
                  }
                />
              </div>
              {quota.reset_at && (
                <p className="text-xs text-slate-400">
                  Resets on{' '}
                  {new Intl.DateTimeFormat('en-US', {
                    day: '2-digit',
                    month: 'long',
                    year: 'numeric',
                  }).format(new Date(quota.reset_at))}
                </p>
              )}
            </div>
          );
        }
      )()}
    </div>
  );
}
