import { describe, it, expect } from 'vitest';
import { DIMENSION_COLORS, truncateLabel, formatCount } from './chartColors';
import type { Dimension } from './chartColors';

// ---------------------------------------------------------------------------
// truncateLabel
// ---------------------------------------------------------------------------

describe('truncateLabel', () => {
  it('возвращает строку без изменений, если она короче порога', () => {
    expect(truncateLabel('Short', 28)).toBe('Short');
  });

  it('возвращает строку без изменений, если она равна порогу', () => {
    const s = 'a'.repeat(28);
    expect(truncateLabel(s, 28)).toBe(s);
  });

  it('усекает и добавляет «…» если строка длиннее порога', () => {
    const s = 'a'.repeat(30);
    const result = truncateLabel(s, 28);
    expect(result).toBe('a'.repeat(28) + '…');
    expect(result).toHaveLength(29);
  });

  it('использует n=28 по умолчанию', () => {
    const s = 'x'.repeat(35);
    expect(truncateLabel(s)).toHaveLength(29); // 28 chars + ellipsis
  });

  it('обрабатывает пустую строку', () => {
    expect(truncateLabel('', 28)).toBe('');
  });
});

// ---------------------------------------------------------------------------
// formatCount
// ---------------------------------------------------------------------------

describe('formatCount', () => {
  it('форматирует тысячи с разделителем', () => {
    expect(formatCount(1000)).toBe('1,000');
    expect(formatCount(39800)).toBe('39,800');
  });

  it('не добавляет разделитель для чисел < 1000', () => {
    expect(formatCount(999)).toBe('999');
    expect(formatCount(0)).toBe('0');
  });

  it('форматирует большие числа', () => {
    expect(formatCount(1_234_567)).toBe('1,234,567');
  });
});

// ---------------------------------------------------------------------------
// DIMENSION_COLORS — структурная целостность
// ---------------------------------------------------------------------------

const EXPECTED_DIMENSIONS: Dimension[] = [
  'year', 'country', 'doc_type', 'journal', 'open_access', 'author',
];

describe('DIMENSION_COLORS', () => {
  it.each(EXPECTED_DIMENSIONS)('измерение "%s" имеет все обязательные поля', (dim) => {
    const profile = DIMENSION_COLORS[dim];
    expect(profile).toBeDefined();
    expect(profile.base).toMatch(/^#[0-9a-f]{6}$/i);
    expect(profile.hover).toMatch(/^#[0-9a-f]{6}$/i);
    expect(profile.selected).toMatch(/^#[0-9a-f]{6}$/i);
    expect(profile.dimmed).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('base и dimmed — разные цвета (dimmed светлее)', () => {
    for (const dim of EXPECTED_DIMENSIONS) {
      expect(DIMENSION_COLORS[dim].base).not.toBe(DIMENSION_COLORS[dim].dimmed);
    }
  });

  it('все base-цвета уникальны (каждое измерение имеет свой цвет)', () => {
    const bases = EXPECTED_DIMENSIONS.map((d) => DIMENSION_COLORS[d].base);
    const unique = new Set(bases);
    expect(unique.size).toBe(EXPECTED_DIMENSIONS.length);
  });
});
