// Чистые функции Table Builder (docs/explore-table-builder/spec.md §3) — вынесены
// из TableBuilderPanel/PivotTable для исчерпывающего юнит-тестирования (тот же
// принцип, что crossChartData.ts: бизнес-логика тестируется полностью, JSX — лёгким
// smoke-тестом).

import type { LabelCount, PivotDimension, PivotMetric, PivotResponse, StatsResponse } from '../../types/api';
import { getLabelMaps } from '../../constants/labelTranslations';
import { formatCount } from '../charts/chartColors';

export const ALL_PIVOT_DIMENSIONS: PivotDimension[] = [
  'year',
  'country',
  'doc_type',
  'journal',
  'open_access',
];

/**
 * Переводит сырое значение измерения для отображения. open_access — особый
 * случай: бэкенд отдаёт его как строки "true"/"false" (`_pivot_label` в
 * postgres_catalog_repo.py) — это вообще не текст на естественном языке, поэтому
 * перевод в "Open Access"/"Closed Access" обязателен независимо от языка (в
 * отличие от country/doc_type, где сырое значение уже валидный английский текст,
 * который просто дополнительно переводится для ru/sr-Latn).
 */
export function formatPivotLabel(dim: PivotDimension, label: string, lang: string): string {
  const maps = getLabelMaps(lang);
  if (dim === 'open_access') {
    const canonical = label === 'true' ? 'Open Access' : 'Closed Access';
    return maps ? (maps.oa[canonical] ?? canonical) : canonical;
  }
  if (!maps) return label;
  if (dim === 'country') return maps.country[label] ?? label;
  if (dim === 'doc_type') return maps.doc_type[label] ?? label;
  return label; // year, journal — не переводятся
}

export interface SlicerOption {
  value: string;
  label: string;
}

/**
 * Источник значений slicer'а — уже загруженный StatsResponse (не новый запрос):
 * by_country/by_journal там уже top-20 по объёму, чего достаточно для фильтра
 * (сам pivot-эндпоинт всё равно режет top_n_rows/top_n_cols тем же порядком
 * величины). open_access — 2 фиксированных значения, не из stats.
 */
export function getSlicerOptions(
  dim: PivotDimension,
  stats: StatsResponse | null,
  lang: string,
): SlicerOption[] {
  if (dim === 'open_access') {
    return [
      { value: 'true', label: formatPivotLabel('open_access', 'true', lang) },
      { value: 'false', label: formatPivotLabel('open_access', 'false', lang) },
    ];
  }
  if (!stats) return [];
  const source: LabelCount[] =
    dim === 'year' ? stats.by_year
    : dim === 'country' ? stats.by_country
    : dim === 'doc_type' ? stats.by_doc_type
    : stats.by_journal; // journal

  const sorted =
    dim === 'year'
      ? [...source].sort((a, b) => Number(b.label) - Number(a.label))
      : [...source].sort((a, b) => b.count - a.count);

  return sorted.map((d) => ({ value: d.label, label: formatPivotLabel(dim, d.label, lang) }));
}

// Непустых ячеек — предупреждение "результат вырожден" при слишком узком slicer'е
// (spec.md §3.2: "UI должен предупреждать, если результат вырождается (< 5 непустых
// ячеек)"). Принимает cell_counts, НЕ matrix (docs/impact-analytics/spec.md §1.2) —
// при metric='avg_citations' matrix[i][j]==0 легитимен ("avg=0"), а cell_counts==0
// однозначно значит "нет статей в этой ячейке".
export function countNonEmptyCells(cellCounts: number[][]): number {
  let n = 0;
  for (const row of cellCounts) {
    for (const cell of row) {
      if (cell > 0) n++;
    }
  }
  return n;
}

// Форматирование значения ячейки под выбранную метрику (UI, локале-зависимое —
// не использовать для CSV, где thousands-separator ломает численный импорт).
export function formatMetricValue(metric: PivotMetric, value: number): string {
  return metric === 'avg_citations' ? value.toFixed(1) : formatCount(value);
}

// ---------------------------------------------------------------------------
// CSV-экспорт (spec.md §3.4) — RFC4180-экранирование + UTF-8 BOM (кириллица
// в RU/sr-Latn лейблах иначе бьётся в Excel на Windows).
// ---------------------------------------------------------------------------

export const CSV_BOM = '\uFEFF';

function escapeCsvField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * `colLabels`/`totalLabel` передаются уже переведёнными (вызывающая сторона
 * знает текущий язык) — функция остаётся чистой и не зависит от react-i18next.
 * Итог правого-нижнего угла — сумма cell_counts (article count), НЕ сумма ячеек
 * matrix: при metric='avg_citations' суммировать средние статистически
 * бессмысленно (docs/impact-analytics/spec.md §1.2); при metric='count' даёт то
 * же число, что и раньше (matrix совпадает с cell_counts поячеечно).
 * Значения ячеек в CSV — "сырые" числа без locale-разделителей (formatCount
 * добавляет запятые, которые ломают численный импорт CSV): count → String(n),
 * avg_citations → toFixed(1).
 */
export function pivotToCsv(
  data: PivotResponse,
  rowDimLabel: string,
  colLabels: string[],
  totalLabel: string,
): string {
  const header = [rowDimLabel, ...colLabels, totalLabel].map(escapeCsvField).join(',');

  const formatCell = (v: number): string => (data.metric === 'avg_citations' ? v.toFixed(1) : String(v));

  const rows = data.row_labels.map((label, i) => {
    const cells = [label, ...data.matrix[i].map(formatCell), String(data.row_totals[i])];
    return cells.map(escapeCsvField).join(',');
  });

  const grandTotal = data.cell_counts.reduce((sum, row) => sum + row.reduce((rowSum, c) => rowSum + c, 0), 0);
  const footer = [totalLabel, ...data.col_totals.map(String), String(grandTotal)]
    .map(escapeCsvField)
    .join(',');

  return [header, ...rows, footer].join('\r\n');
}
