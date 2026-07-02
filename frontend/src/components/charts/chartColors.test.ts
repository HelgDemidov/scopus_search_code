import { describe, it, expect } from 'vitest';
import {
  DIMENSION_COLORS,
  truncateLabel,
  formatCount,
  AXIS_COLORS,
  getRankedBarColor,
  TAXONOMY_PALETTE,
  getTaxonomyColor,
} from './chartColors';
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

// ---------------------------------------------------------------------------
// AXIS_COLORS
// ---------------------------------------------------------------------------

describe('AXIS_COLORS', () => {
  it('содержит валидные hex-цвета для обеих тем', () => {
    for (const theme of ['light', 'dark'] as const) {
      expect(AXIS_COLORS[theme].tick).toMatch(/^#[0-9a-f]{6}$/i);
      expect(AXIS_COLORS[theme].tickMuted).toMatch(/^#[0-9a-f]{6}$/i);
      expect(AXIS_COLORS[theme].grid).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('tick и grid различаются между темами (иначе тема не влияла бы на контраст)', () => {
    expect(AXIS_COLORS.light.tick).not.toBe(AXIS_COLORS.dark.tick);
    expect(AXIS_COLORS.light.grid).not.toBe(AXIS_COLORS.dark.grid);
  });
});

// ---------------------------------------------------------------------------
// getRankedBarColor
// ---------------------------------------------------------------------------

describe('getRankedBarColor', () => {
  it('верхний ранг (index=0) всегда возвращает чистый base, независимо от total', () => {
    expect(getRankedBarColor('country', 0, 15, 'light')).toBe(DIMENSION_COLORS.country.base);
    expect(getRankedBarColor('country', 0, 15, 'dark')).toBe(DIMENSION_COLORS.country.base);
  });

  it('total=1 (единственный бар) возвращает чистый base', () => {
    expect(getRankedBarColor('journal', 0, 1, 'light')).toBe(DIMENSION_COLORS.journal.base);
  });

  it('нижний ранг (index=total-1) смещён к dimmed/darkDimmed, но не совпадает с ними (t*0.7, не 100%)', () => {
    const lightResult = getRankedBarColor('author', 14, 15, 'light');
    const darkResult = getRankedBarColor('author', 14, 15, 'dark');
    expect(lightResult).not.toBe(DIMENSION_COLORS.author.base);
    expect(lightResult).not.toBe(DIMENSION_COLORS.author.dimmed);
    expect(darkResult).not.toBe(DIMENSION_COLORS.author.base);
    expect(darkResult).not.toBe(DIMENSION_COLORS.author.darkDimmed);
  });

  it('light и dark темы дают разный результат для одного и того же ранга (разные target-цвета)', () => {
    const lightResult = getRankedBarColor('doc_type', 5, 12, 'light');
    const darkResult = getRankedBarColor('doc_type', 5, 12, 'dark');
    expect(lightResult).not.toBe(darkResult);
  });

  it('возвращает валидный hex для всех измерений', () => {
    for (const dim of EXPECTED_DIMENSIONS) {
      expect(getRankedBarColor(dim, 3, 10, 'light')).toMatch(/^#[0-9a-f]{6}$/i);
      expect(getRankedBarColor(dim, 3, 10, 'dark')).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

// ---------------------------------------------------------------------------
// TAXONOMY_PALETTE / getTaxonomyColor
// ---------------------------------------------------------------------------

describe('TAXONOMY_PALETTE', () => {
  it('содержит минимум 12 цветов (по числу типов документов на проде)', () => {
    expect(TAXONOMY_PALETTE.length).toBeGreaterThanOrEqual(12);
  });

  it('все цвета — валидные hex', () => {
    for (const color of TAXONOMY_PALETTE) {
      expect(color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('все цвета в палитре уникальны (иначе смежные сегменты donut совпадут)', () => {
    expect(new Set(TAXONOMY_PALETTE).size).toBe(TAXONOMY_PALETTE.length);
  });
});

describe('getTaxonomyColor', () => {
  it('возвращает соответствующий цвет палитры по индексу', () => {
    expect(getTaxonomyColor(0)).toBe(TAXONOMY_PALETTE[0]);
    expect(getTaxonomyColor(3)).toBe(TAXONOMY_PALETTE[3]);
  });

  it('первые 5 цветов (самые крупные сегменты доната) попарно различны', () => {
    const first5 = Array.from({ length: 5 }, (_, i) => getTaxonomyColor(i));
    expect(new Set(first5).size).toBe(5);
  });

  it('циклически повторяется, если индекс выходит за длину палитры', () => {
    expect(getTaxonomyColor(TAXONOMY_PALETTE.length)).toBe(TAXONOMY_PALETTE[0]);
  });
});
