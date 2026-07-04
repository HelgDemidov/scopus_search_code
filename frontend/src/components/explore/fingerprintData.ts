import type { SearchHistoryItem } from '../../types/api';

// Filter fingerprint — таймлайн-полоса состава фильтров за последние N поисков
// (docs/explore-personal-redesign/spec.md §2.2). Чистые функции подготовки
// данных — тестируются полностью, отдельно от JSX (тот же принцип, что
// crossChartData.ts/tableBuilderData.ts).

export interface FingerprintColumn {
  createdAt: string; // ISO datetime — для подписи столбца
  openAccessUsed: boolean;
  docTypesCount: number;
  countriesCount: number;
  yearRangeWidth: number | null; // null = год не сужался (year_from/year_to не заданы вместе)
  isZeroResult: boolean;
}

interface RawFilters {
  open_access?: boolean;
  document_types?: string[];
  countries?: string[];
  year_from?: number;
  year_to?: number;
}

// items — как отдаёт GET /articles/history (newest-first). Берём последние
// maxColumns и разворачиваем в хронологический порядок (старые слева, как в
// выбранном пользователем превью "search → 1 2 3 ... N").
export function buildFingerprintColumns(items: SearchHistoryItem[], maxColumns: number): FingerprintColumn[] {
  return items
    .slice(0, maxColumns)
    .reverse()
    .map((item) => {
      const filters = item.filters as RawFilters;
      const hasYearRange = filters.year_from !== undefined && filters.year_to !== undefined;
      return {
        createdAt: item.created_at,
        openAccessUsed: filters.open_access !== undefined,
        docTypesCount: filters.document_types?.length ?? 0,
        countriesCount: filters.countries?.length ?? 0,
        yearRangeWidth: hasYearRange ? (filters.year_to as number) - (filters.year_from as number) : null,
        isZeroResult: !item.results_available,
      };
    });
}

// Row-relative нормализация (не глобальная по всей таблице) — иначе строка
// "year range width" (шкала лет) визуально забивает строку "doc_types" (шкала 0-5),
// хотя они на разных порядках величин (spec.md §2.2).
export function rowRelativeIntensity(values: Array<number | null>): number[] {
  const nums = values.filter((v): v is number => v !== null);
  if (nums.length === 0) return values.map(() => 0);
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  if (max === min) return values.map((v) => (v === null ? 0 : 1));
  return values.map((v) => (v === null ? 0 : (v - min) / (max - min)));
}
