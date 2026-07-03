import { describe, it, expect } from 'vitest';
import {
  ALL_PIVOT_DIMENSIONS,
  formatPivotLabel,
  getSlicerOptions,
  countNonEmptyCells,
  pivotToCsv,
  CSV_BOM,
} from './tableBuilderData';
import type { PivotResponse, StatsResponse } from '../../types/api';

// ---------------------------------------------------------------------------
// ALL_PIVOT_DIMENSIONS
// ---------------------------------------------------------------------------

describe('ALL_PIVOT_DIMENSIONS', () => {
  it('содержит ровно 5 измерений, author исключён', () => {
    expect(ALL_PIVOT_DIMENSIONS).toHaveLength(5);
    expect(ALL_PIVOT_DIMENSIONS).not.toContain('author');
  });
});

// ---------------------------------------------------------------------------
// formatPivotLabel
// ---------------------------------------------------------------------------

describe('formatPivotLabel', () => {
  it('open_access: "true"/"false" → "Open Access"/"Closed Access" даже для en (не текст на естественном языке)', () => {
    expect(formatPivotLabel('open_access', 'true', 'en')).toBe('Open Access');
    expect(formatPivotLabel('open_access', 'false', 'en')).toBe('Closed Access');
  });

  it('open_access переводится на ru', () => {
    expect(formatPivotLabel('open_access', 'true', 'ru')).toBe('Open Access');
    expect(formatPivotLabel('open_access', 'false', 'ru')).toBe('Закрытый доступ');
  });

  it('country переводится на ru, не трогается на en', () => {
    expect(formatPivotLabel('country', 'China', 'ru')).toBe('Китай');
    expect(formatPivotLabel('country', 'China', 'en')).toBe('China');
  });

  it('doc_type переводится на sr-Latn', () => {
    expect(formatPivotLabel('doc_type', 'Article', 'sr-Latn')).toBe('Članak');
  });

  it('year/journal никогда не переводятся', () => {
    expect(formatPivotLabel('year', '2024', 'ru')).toBe('2024');
    expect(formatPivotLabel('journal', 'Nature', 'ru')).toBe('Nature');
  });

  it('неизвестная метка страны/типа документа возвращается как есть (fallback)', () => {
    expect(formatPivotLabel('country', 'Neverland', 'ru')).toBe('Neverland');
  });
});

// ---------------------------------------------------------------------------
// getSlicerOptions
// ---------------------------------------------------------------------------

const STATS = {
  total_articles: 100,
  total_journals: 2,
  total_countries: 2,
  total_authors: 1,
  open_access_count: 40,
  by_year: [
    { label: '2022', count: 10 },
    { label: '2024', count: 50 },
    { label: '2023', count: 20 },
  ],
  by_journal: [
    { label: 'Nature', count: 30 },
    { label: 'Science', count: 50 },
  ],
  by_country: [
    { label: 'United States', count: 20 },
    { label: 'China', count: 60 },
  ],
  by_doc_type: [{ label: 'Article', count: 90 }],
  top_keywords: [],
  top_authors: [],
  by_year_top_countries: [],
  sunburst_country_open_access: [],
  top_journals_by_country: [],
} satisfies StatsResponse;

describe('getSlicerOptions', () => {
  it('open_access — 2 фиксированных значения независимо от stats (даже null)', () => {
    expect(getSlicerOptions('open_access', null, 'en')).toEqual([
      { value: 'true', label: 'Open Access' },
      { value: 'false', label: 'Closed Access' },
    ]);
  });

  it('stats === null для остальных измерений — пустой список, не падает', () => {
    expect(getSlicerOptions('country', null, 'en')).toEqual([]);
  });

  it('year — сортируется по убыванию года (не по count)', () => {
    const options = getSlicerOptions('year', STATS, 'en');
    expect(options.map((o) => o.value)).toEqual(['2024', '2023', '2022']);
  });

  it('country — сортируется по убыванию count и переведена на ru', () => {
    const options = getSlicerOptions('country', STATS, 'ru');
    expect(options).toEqual([
      { value: 'China', label: 'Китай' },
      { value: 'United States', label: 'США' },
    ]);
  });

  it('journal — сортируется по убыванию count, без перевода', () => {
    const options = getSlicerOptions('journal', STATS, 'ru');
    expect(options.map((o) => o.value)).toEqual(['Science', 'Nature']);
  });
});

// ---------------------------------------------------------------------------
// countNonEmptyCells
// ---------------------------------------------------------------------------

describe('countNonEmptyCells', () => {
  it('считает только ячейки > 0', () => {
    expect(countNonEmptyCells([[0, 3], [0, 0], [5, 0]])).toBe(2);
  });

  it('пустая матрица → 0', () => {
    expect(countNonEmptyCells([])).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// pivotToCsv
// ---------------------------------------------------------------------------

describe('pivotToCsv', () => {
  const DATA: PivotResponse = {
    row_dim: 'country',
    col_dim: 'doc_type',
    row_labels: ['China', 'USA'],
    col_labels: ['Article', 'Review'],
    matrix: [
      [30, 5],
      [10, 2],
    ],
    row_totals: [40, 15],
    col_totals: [45, 8],
  };

  it('заголовок содержит rowDimLabel, colLabels и totalLabel', () => {
    const csv = pivotToCsv(DATA, 'Country', ['Article', 'Review'], 'Total');
    const [header] = csv.split('\r\n');
    expect(header).toBe('Country,Article,Review,Total');
  });

  it('строки данных содержат метку строки, значения матрицы и row_totals', () => {
    const csv = pivotToCsv(DATA, 'Country', ['Article', 'Review'], 'Total');
    const lines = csv.split('\r\n');
    expect(lines[1]).toBe('China,30,5,40');
    expect(lines[2]).toBe('USA,10,2,15');
  });

  it('последняя строка — col_totals + grand total (сумма реально показанных ячеек)', () => {
    const csv = pivotToCsv(DATA, 'Country', ['Article', 'Review'], 'Total');
    const lines = csv.split('\r\n');
    // 30+5+10+2 = 47 — не равно ни сумме row_totals (55), ни col_totals (53):
    // это осознанное решение (см. комментарий в исходнике), т.к. row/col_totals
    // маржинальные (по полной выборке для своей оси, до пересечения с другой).
    expect(lines[3]).toBe('Total,45,8,47');
  });

  it('экранирует запятую и кавычки в метках (RFC4180)', () => {
    const data: PivotResponse = {
      ...DATA,
      row_labels: ['Journal, with comma', 'Journal "quoted"'],
    };
    const csv = pivotToCsv(data, 'Journal', ['Article', 'Review'], 'Total');
    const lines = csv.split('\r\n');
    expect(lines[1]).toBe('"Journal, with comma",30,5,40');
    expect(lines[2]).toBe('"Journal ""quoted""",10,2,15');
  });

  it('CSV_BOM — символ U+FEFF (для корректной кириллицы в Excel на Windows)', () => {
    expect(CSV_BOM).toBe('﻿');
    expect(CSV_BOM.charCodeAt(0)).toBe(0xfeff);
  });
});
