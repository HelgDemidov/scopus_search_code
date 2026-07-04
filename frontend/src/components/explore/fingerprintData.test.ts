import { describe, it, expect } from 'vitest';
import { buildFingerprintColumns, rowRelativeIntensity } from './fingerprintData';
import type { SearchHistoryItem } from '../../types/api';

function item(overrides: Partial<SearchHistoryItem> & { filters?: Record<string, unknown> }): SearchHistoryItem {
  return {
    id: 1,
    query: 'q',
    created_at: '2024-01-01T00:00:00Z',
    result_count: 1,
    results_available: true,
    filters: {},
    ...overrides,
  };
}

describe('buildFingerprintColumns', () => {
  it('разворачивает newest-first в хронологический порядок', () => {
    const items = [
      item({ id: 3, created_at: '2024-01-03T00:00:00Z' }),
      item({ id: 2, created_at: '2024-01-02T00:00:00Z' }),
      item({ id: 1, created_at: '2024-01-01T00:00:00Z' }),
    ];

    const cols = buildFingerprintColumns(items, 10);

    expect(cols.map((c) => c.createdAt)).toEqual([
      '2024-01-01T00:00:00Z',
      '2024-01-02T00:00:00Z',
      '2024-01-03T00:00:00Z',
    ]);
  });

  it('режет до maxColumns — берёт maxColumns самых последних (newest-first до slice)', () => {
    const items = Array.from({ length: 5 }, (_, i) => item({ id: i, created_at: `2024-01-0${5 - i}T00:00:00Z` }));

    const cols = buildFingerprintColumns(items, 2);

    expect(cols).toHaveLength(2);
    // Самые последние 2 (id=0 '01-05' и id=1 '01-04'), развёрнутые в хронологию
    expect(cols.map((c) => c.createdAt)).toEqual(['2024-01-04T00:00:00Z', '2024-01-05T00:00:00Z']);
  });

  it('openAccessUsed=true когда filters.open_access присутствует (даже если false)', () => {
    const cols = buildFingerprintColumns([item({ filters: { open_access: false } })], 10);
    expect(cols[0].openAccessUsed).toBe(true);
  });

  it('openAccessUsed=false когда ключ отсутствует', () => {
    const cols = buildFingerprintColumns([item({ filters: {} })], 10);
    expect(cols[0].openAccessUsed).toBe(false);
  });

  it('docTypesCount/countriesCount — длина массивов, 0 если отсутствуют', () => {
    const cols = buildFingerprintColumns(
      [item({ filters: { document_types: ['Article', 'Review'], countries: ['Germany'] } })],
      10,
    );
    expect(cols[0].docTypesCount).toBe(2);
    expect(cols[0].countriesCount).toBe(1);

    const empty = buildFingerprintColumns([item({ filters: {} })], 10);
    expect(empty[0].docTypesCount).toBe(0);
    expect(empty[0].countriesCount).toBe(0);
  });

  it('yearRangeWidth считается только когда ОБА year_from и year_to заданы', () => {
    const both = buildFingerprintColumns([item({ filters: { year_from: 2010, year_to: 2020 } })], 10);
    expect(both[0].yearRangeWidth).toBe(10);

    const onlyFrom = buildFingerprintColumns([item({ filters: { year_from: 2010 } })], 10);
    expect(onlyFrom[0].yearRangeWidth).toBeNull();

    const neither = buildFingerprintColumns([item({ filters: {} })], 10);
    expect(neither[0].yearRangeWidth).toBeNull();
  });

  it('isZeroResult — инверсия results_available', () => {
    const zero = buildFingerprintColumns([item({ results_available: false })], 10);
    expect(zero[0].isZeroResult).toBe(true);

    const hit = buildFingerprintColumns([item({ results_available: true })], 10);
    expect(hit[0].isZeroResult).toBe(false);
  });
});

describe('rowRelativeIntensity', () => {
  it('пустой массив/все null → все 0', () => {
    expect(rowRelativeIntensity([])).toEqual([]);
    expect(rowRelativeIntensity([null, null])).toEqual([0, 0]);
  });

  it('линейная нормализация 0..1 по min/max строки', () => {
    expect(rowRelativeIntensity([0, 5, 10])).toEqual([0, 0.5, 1]);
  });

  it('все значения одинаковы (non-null) → полная интенсивность, не деление на 0', () => {
    expect(rowRelativeIntensity([7, 7, 7])).toEqual([1, 1, 1]);
  });

  it('null среди чисел → null маппится в 0, числа нормализуются между собой', () => {
    expect(rowRelativeIntensity([null, 0, 10])).toEqual([0, 0, 1]);
  });
});
