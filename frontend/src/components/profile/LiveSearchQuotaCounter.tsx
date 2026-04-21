import { useQuotaStore } from '../../stores/quotaStore';
import { Skeleton } from '../ui/skeleton';

function formatResetDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('ru-RU', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function LiveSearchQuotaCounter() {
  const quota = useQuotaStore((s) => s.quota);

  // Skeleton-grid из 4 ячеек — повторяет структуру реального контента
  if (!quota) {
    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-1">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-5 w-20" />
          </div>
        ))}
      </div>
    );
  }

  const cells: Array<{ label: string; value: string }> = [
    { label: 'Лимит', value: quota.limit.toLocaleString('ru-RU') },
    { label: 'Использовано', value: quota.used.toLocaleString('ru-RU') },
    { label: 'Осталось', value: quota.remaining.toLocaleString('ru-RU') },
    { label: 'Сбросится', value: formatResetDate(quota.reset_at) },
  ];

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
      {cells.map((cell) => (
        <div key={cell.label} className="flex flex-col">
          <p className="text-xs text-slate-500 dark:text-slate-400">{cell.label}</p>
          <p className="text-base font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
            {cell.value}
          </p>
        </div>
      ))}
    </div>
  );
}
