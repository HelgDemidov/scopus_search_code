import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useHistoryStore } from '../../stores/historyStore';
import { Button } from '../ui/button';
import { Switch } from '../ui/switch';
import { Badge } from '../ui/badge';
import type { SearchHistoryItem } from '../../types/api';

function formatCreatedAt(iso: string): string {
  try {
    return new Intl.DateTimeFormat('ru-RU', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function filterEntries(item: SearchHistoryItem): Array<{ key: string; label: string }> {
  const out: Array<{ key: string; label: string }> = [];
  const filters = item.filters ?? {};
  for (const [key, raw] of Object.entries(filters)) {
    if (raw === undefined || raw === null || raw === '') continue;
    if (Array.isArray(raw)) {
      if (raw.length === 0) continue;
      out.push({ key, label: `${key}: ${raw.map((v) => String(v)).join(', ')}` });
    } else if (typeof raw === 'boolean') {
      if (raw) out.push({ key, label: key });
    } else {
      out.push({ key, label: `${key}: ${String(raw)}` });
    }
  }
  return out;
}

function entryYear(iso: string): number | null {
  if (!iso || iso.length < 4) return null;
  const y = parseInt(iso.slice(0, 4), 10);
  return Number.isFinite(y) ? y : null;
}

function entryOpenAccess(item: SearchHistoryItem): boolean {
  const v = (item.filters ?? {})['openAccessOnly'] ?? (item.filters ?? {})['open_access'];
  return v === true;
}

export function SearchHistoryList() {
  const { items, historyFilters, setHistoryFilters, isLoading } = useHistoryStore();

  const filtered = useMemo(() => {
    return items.filter((item) => {
      const y = entryYear(item.created_at);
      if (historyFilters.yearFrom && (y === null || y < historyFilters.yearFrom)) return false;
      if (historyFilters.yearTo && (y === null || y > historyFilters.yearTo)) return false;
      if (historyFilters.openAccessOnly && !entryOpenAccess(item)) return false;
      return true;
    });
  }, [items, historyFilters]);

  function resetFilters() {
    setHistoryFilters({ yearFrom: undefined, yearTo: undefined, openAccessOnly: undefined });
  }

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col">
          <label className="text-xs text-slate-500 dark:text-slate-400">Год с</label>
          <input
            type="number"
            value={historyFilters.yearFrom ?? ''}
            onChange={(e) =>
              setHistoryFilters({
                yearFrom: e.target.value ? Number(e.target.value) : undefined,
              })
            }
            className="w-24 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-xs text-slate-900 dark:text-slate-100"
          />
        </div>
        <div className="flex flex-col">
          <label className="text-xs text-slate-500 dark:text-slate-400">Год по</label>
          <input
            type="number"
            value={historyFilters.yearTo ?? ''}
            onChange={(e) =>
              setHistoryFilters({
                yearTo: e.target.value ? Number(e.target.value) : undefined,
              })
            }
            className="w-24 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-xs text-slate-900 dark:text-slate-100"
          />
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={!!historyFilters.openAccessOnly}
            onCheckedChange={(checked) =>
              setHistoryFilters({ openAccessOnly: checked || undefined })
            }
          />
          <span className="text-xs text-slate-700 dark:text-slate-300">Только Open Access</span>
        </div>
        <Button variant="ghost" size="sm" onClick={resetFilters} className="text-xs">
          Сбросить
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Загрузка…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">История поиска пуста</p>
      ) : (
        <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-700">
          {filtered.map((item) => {
            const chips = filterEntries(item);
            return (
              <li key={item.id} className="py-3 flex flex-col gap-1">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100 break-words">
                    {item.query}
                  </p>
                  <p className="text-xs text-slate-400 whitespace-nowrap">
                    {formatCreatedAt(item.created_at)}
                  </p>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {item.result_count.toLocaleString('ru-RU')} статей
                </p>
                {chips.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {chips.map((chip) => (
                      <Badge key={chip.key} variant="secondary" className="text-xs">
                        {chip.label}
                      </Badge>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="pt-2 border-t border-slate-100 dark:border-slate-700">
        <Link
          to="/explore?mode=personal"
          className="text-sm text-blue-800 dark:text-blue-400 hover:underline"
        >
          Перейти в аналитику по моим поискам →
        </Link>
      </div>
    </div>
  );
}
