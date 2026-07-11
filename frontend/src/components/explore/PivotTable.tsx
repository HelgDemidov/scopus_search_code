import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Download, ChevronUp, ChevronDown } from 'lucide-react';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { PaginationControls } from '../ui/PaginationControls';
import { formatCount } from '../charts/chartColors';
import { formatPivotLabel, formatMetricValue, pivotToCsv, countNonEmptyCells, CSV_BOM } from './tableBuilderData';
import type { PivotDimension, PivotResponse } from '../../types/api';

// Table Builder — 2D pivot таблица (docs/explore-table-builder/spec.md §3.4).
// Сортировка/поиск/пагинация — над уже загруженным PivotResponse (top-N с
// бэкенда), никаких доп. запросов. CSV-экспорт см. tableBuilderData.ts —
// генерация строки протестирована отдельно от DOM-скачивания (второе не
// юнит-тестируемо в jsdom, см. spec.md §4).

const PAGE_SIZE = 15;
// < 5 непустых ячеек — вырожденный результат (узкий slicer), предупреждаем (spec.md §3.2)
const SPARSE_THRESHOLD = 5;

type SortKey = 'label' | 'total' | number;

interface PivotTableProps {
  data: PivotResponse;
  rowDim: PivotDimension;
  colDim: PivotDimension;
}

function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([CSV_BOM + content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function SortableHeader({
  label,
  sortKey,
  active,
  dir,
  onSort,
  align,
}: {
  label: string;
  sortKey: SortKey;
  active: boolean;
  dir: 'asc' | 'desc';
  onSort: (key: SortKey) => void;
  align: 'left' | 'right';
}) {
  return (
    <th
      scope="col"
      aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={[
        // Заголовки — реальные подписи данных (страны, типы документов и т.п.), а не
        // просто UI-хром, поэтому контраст выше типового muted-заголовка таблицы
        // (text-slate-500 без dark:-варианта было плохо читаемо в обеих темах).
        'px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide select-none whitespace-nowrap',
        align === 'right' ? 'text-right' : 'text-left',
      ].join(' ')}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-1 w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded cursor-pointer ${align === 'right' ? 'flex-row-reverse justify-start' : 'justify-start'}`}
      >
        {label}
        {active &&
          (dir === 'asc' ? (
            <ChevronUp className="size-3" aria-hidden />
          ) : (
            <ChevronDown className="size-3" aria-hidden />
          ))}
      </button>
    </th>
  );
}

export function PivotTable({ data, rowDim, colDim }: PivotTableProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;

  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('total');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);

  const rowDimLabel = t(`explore.dimensionLabels.${rowDim}`);
  // При avg_citations "Итого" всё равно показывает article count (row_totals/col_totals
  // не зависят от метрики) — лейбл меняется, чтобы это не читалось как "сумма средних".
  const totalLabel = t(
    data.metric === 'avg_citations' ? 'explore.tableBuilder.totalColumnCount' : 'explore.tableBuilder.totalColumn',
  );

  const colHeaders = useMemo(
    () => data.col_labels.map((raw) => formatPivotLabel(colDim, raw, lang)),
    [data.col_labels, colDim, lang],
  );

  const rows = useMemo(
    () =>
      data.row_labels.map((raw, i) => ({
        raw,
        display: formatPivotLabel(rowDim, raw, lang),
        cells: data.matrix[i],
        counts: data.cell_counts[i],
        total: data.row_totals[i],
      })),
    [data, rowDim, lang],
  );

  const filteredSorted = useMemo(() => {
    let list = rows;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((r) => r.display.toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => {
      let cmp: number;
      if (sortKey === 'label') cmp = a.display.localeCompare(b.display);
      else if (sortKey === 'total') cmp = a.total - b.total;
      else cmp = a.cells[sortKey] - b.cells[sortKey];
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [rows, search, sortKey, sortDir]);

  // Сброс на первую страницу при смене поиска/сортировки — иначе можно застрять
  // на несуществующей странице, если после фильтра список стал короче.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPage(1);
  }, [search, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filteredSorted.length / PAGE_SIZE));
  const pageRows = filteredSorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Сумма cell_counts (article count), не matrix — при metric='avg_citations' суммировать
  // средние статистически бессмысленно (docs/impact-analytics/spec.md §1.2); при metric='count'
  // даёт то же число, что и раньше.
  const grandTotal = useMemo(
    () => data.cell_counts.reduce((sum, row) => sum + row.reduce((rowSum, c) => rowSum + c, 0), 0),
    [data],
  );
  const nonEmptyCells = useMemo(() => countNonEmptyCells(data.cell_counts), [data]);
  const isSparse = nonEmptyCells > 0 && nonEmptyCells < SPARSE_THRESHOLD;

  // Клик 1 (другая колонка) → natural-направление (desc для чисел, asc для label).
  // Клик 2 (та же колонка) → противоположное направление.
  // Клик 3 (та же колонка, уже в противоположном направлении) → сброс на дефолт
  // (total desc) — без него сортировку было не сбросить обратно.
  function handleSort(key: SortKey) {
    const naturalDir = key === 'label' ? 'asc' : 'desc';
    if (key !== sortKey) {
      setSortKey(key);
      setSortDir(naturalDir);
    } else if (sortDir === naturalDir) {
      setSortDir(naturalDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey('total');
      setSortDir('desc');
    }
  }

  function handleExportCsv() {
    const csv = pivotToCsv(data, rowDimLabel, colHeaders, totalLabel);
    downloadCsv(`pivot_${rowDim}_${colDim}.csv`, csv);
  }

  if (data.row_labels.length === 0 || data.col_labels.length === 0) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400 py-6 text-center">
        {t('explore.tableBuilder.emptyState')}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-[220px]">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-slate-400 pointer-events-none" aria-hidden />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('explore.tableBuilder.searchPlaceholder')}
            aria-label={t('explore.tableBuilder.searchPlaceholder')}
            className="pl-7 h-7 text-xs"
          />
        </div>
        <Button variant="outline" size="sm" onClick={handleExportCsv} className="ml-auto gap-1.5">
          <Download className="size-3.5" aria-hidden />
          {t('explore.tableBuilder.csvExport')}
        </Button>
      </div>

      {isSparse && (
        <p className="text-xs text-amber-600 dark:text-amber-400">{t('explore.tableBuilder.sparseWarning')}</p>
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
              <SortableHeader label={rowDimLabel} sortKey="label" active={sortKey === 'label'} dir={sortDir} onSort={handleSort} align="left" />
              {colHeaders.map((label, ci) => (
                <SortableHeader
                  key={label}
                  label={label}
                  sortKey={ci}
                  active={sortKey === ci}
                  dir={sortDir}
                  onSort={handleSort}
                  align="right"
                />
              ))}
              <SortableHeader label={totalLabel} sortKey="total" active={sortKey === 'total'} dir={sortDir} onSort={handleSort} align="right" />
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row) => (
              <tr
                key={row.raw}
                className="border-b border-slate-100 dark:border-slate-800 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors"
              >
                <td className="px-3 py-2 text-slate-700 dark:text-slate-300 max-w-[220px] break-words">{row.display}</td>
                {row.cells.map((c, ci) => (
                  <td key={ci} className="px-3 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">
                    {row.counts[ci] > 0 ? formatMetricValue(data.metric, c) : '–'}
                  </td>
                ))}
                <td className="px-3 py-2 text-right font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                  {formatCount(row.total)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 font-semibold">
              <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{totalLabel}</td>
              {data.col_totals.map((c, ci) => (
                <td key={ci} className="px-3 py-2 text-right tabular-nums text-slate-900 dark:text-slate-100">
                  {formatCount(c)}
                </td>
              ))}
              <td className="px-3 py-2 text-right tabular-nums text-slate-900 dark:text-slate-100">{formatCount(grandTotal)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="text-[11px] text-slate-400">{t('explore.tableBuilder.marginalNote')}</p>

      <PaginationControls page={page} totalPages={totalPages} onPageChange={setPage} total={filteredSorted.length} size={PAGE_SIZE} />
    </div>
  );
}
