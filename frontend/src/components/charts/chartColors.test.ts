import { describe, it, expect } from 'vitest';
import {
  DIMENSION_COLORS,
  truncateLabel,
  formatCount,
  AXIS_COLORS,
  getRankedBarColor,
  TAXONOMY_PALETTE,
  getTaxonomyColor,
  getYearRangeBounds,
  zeroFillYears,
  pivotYearCountrySeries,
  applyMinimumArcFloor,
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

  it('нижний ранг (index=total-1) смещён к чёрному (light) / белому (dark), но не совпадает с ними (t=0.88, не 100%)', () => {
    const lightResult = getRankedBarColor('author', 14, 15, 'light');
    const darkResult = getRankedBarColor('author', 14, 15, 'dark');
    expect(lightResult).not.toBe(DIMENSION_COLORS.author.base);
    expect(lightResult).not.toBe('#000000');
    expect(darkResult).not.toBe(DIMENSION_COLORS.author.base);
    expect(darkResult).not.toBe('#ffffff');
  });

  it('нижний ранг отличается от цели (белого в dark / чёрного в light) не более чем на ~15%', () => {
    // 0.88 пути к цели ⇒ остаточная дистанция ~12% (в рамках требуемых 10-15%)
    const darkResult = getRankedBarColor('author', 14, 15, 'dark');
    const { r, g, b } = { r: parseInt(darkResult.slice(1, 3), 16), g: parseInt(darkResult.slice(3, 5), 16), b: parseInt(darkResult.slice(5, 7), 16) };
    for (const channel of [r, g, b]) {
      expect(255 - channel).toBeLessThanOrEqual(255 * 0.15);
    }

    const lightResult = getRankedBarColor('author', 14, 15, 'light');
    const lr = parseInt(lightResult.slice(1, 3), 16);
    const lg = parseInt(lightResult.slice(3, 5), 16);
    const lb = parseInt(lightResult.slice(5, 7), 16);
    for (const channel of [lr, lg, lb]) {
      expect(channel).toBeLessThanOrEqual(255 * 0.15);
    }
  });

  it('в dark теме нижний ранг светлее (ближе к белому), в light — темнее (ближе к чёрному)', () => {
    const darkResult = getRankedBarColor('doc_type', 11, 12, 'dark');
    const lightResult = getRankedBarColor('doc_type', 11, 12, 'light');
    const luminance = (hex: string) =>
      [1, 3, 5].reduce((sum, i) => sum + parseInt(hex.slice(i, i + 2), 16), 0);
    expect(luminance(darkResult)).toBeGreaterThan(luminance(DIMENSION_COLORS.doc_type.base));
    expect(luminance(lightResult)).toBeLessThan(luminance(DIMENSION_COLORS.doc_type.base));
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

// ---------------------------------------------------------------------------
// getYearRangeBounds / zeroFillYears (post-prod §14 п.6 — Publications by Year)
// ---------------------------------------------------------------------------

describe('getYearRangeBounds', () => {
  it('absoluteMin — реальный минимальный год в данных', () => {
    const data = [{ label: '1965', count: 1 }, { label: '2023', count: 500 }];
    expect(getYearRangeBounds(data, 2010).absoluteMin).toBe(1965);
  });

  it('defaultStart = defaultMin, если реальные данные начинаются раньше', () => {
    const data = [{ label: '1965', count: 1 }, { label: '2023', count: 500 }];
    expect(getYearRangeBounds(data, 2010).defaultStart).toBe(2010);
  });

  it('defaultStart не может быть раньше фактических данных (клэмп вверх)', () => {
    // Если реальный минимум (2015) позже дефолта (2010) — стартовое значение
    // не должно выходить за пределы слайдера (min=absoluteMin для Radix Slider).
    const data = [{ label: '2015', count: 10 }, { label: '2020', count: 20 }];
    const { absoluteMin, defaultStart } = getYearRangeBounds(data, 2010);
    expect(absoluteMin).toBe(2015);
    expect(defaultStart).toBe(2015);
  });

  it('пустые данные → фоллбэк на defaultMin для обеих границ', () => {
    expect(getYearRangeBounds([], 2010)).toEqual({ absoluteMin: 2010, defaultStart: 2010 });
  });
});

describe('zeroFillYears', () => {
  it('заполняет нулём годы без статей внутри диапазона', () => {
    const data = [{ label: '2020', count: 10 }, { label: '2023', count: 5 }];
    const result = zeroFillYears(data, 2020, 2023);
    expect(result).toEqual([
      { label: '2020', count: 10 },
      { label: '2021', count: 0 },
      { label: '2022', count: 0 },
      { label: '2023', count: 5 },
    ]);
  });

  it('длина результата всегда = end - start + 1, независимо от разреженности данных', () => {
    const data = [{ label: '1965', count: 1 }];
    const result = zeroFillYears(data, 1965, 2030);
    expect(result).toHaveLength(2030 - 1965 + 1);
  });

  it('данные вне диапазона [start, end] не попадают в результат', () => {
    const data = [{ label: '1900', count: 999 }, { label: '2015', count: 3 }];
    const result = zeroFillYears(data, 2010, 2020);
    expect(result.find((r) => r.label === '1900')).toBeUndefined();
    expect(result.find((r) => r.label === '2015')).toEqual({ label: '2015', count: 3 });
  });

  it('минимальный диапазон (start === end) возвращает ровно один элемент', () => {
    const result = zeroFillYears([{ label: '2029', count: 7 }], 2029, 2030);
    expect(result).toEqual([
      { label: '2029', count: 7 },
      { label: '2030', count: 0 },
    ]);
  });
});

// ---------------------------------------------------------------------------
// pivotYearCountrySeries
// ---------------------------------------------------------------------------

describe('pivotYearCountrySeries', () => {
  it('сводит плоские (year, country, count) в wide-формат с одним ключом на страну', () => {
    const data = [
      { year: 2023, country: 'China', count: 100 },
      { year: 2023, country: 'USA', count: 50 },
      { year: 2024, country: 'China', count: 120 },
    ];
    const result = pivotYearCountrySeries(data, ['China', 'USA'], 2023, 2024);
    expect(result).toEqual([
      { year: 2023, China: 100, USA: 50 },
      { year: 2024, China: 120, USA: 0 },
    ]);
  });

  it('заполняет нулём (год, страна) без данных — включая страну без единой записи в диапазоне', () => {
    const data = [{ year: 2023, country: 'China', count: 10 }];
    const result = pivotYearCountrySeries(data, ['China', 'India'], 2023, 2025);
    expect(result).toEqual([
      { year: 2023, China: 10, India: 0 },
      { year: 2024, China: 0, India: 0 },
      { year: 2025, China: 0, India: 0 },
    ]);
  });

  it('длина результата всегда = end - start + 1', () => {
    const result = pivotYearCountrySeries([], ['China'], 2000, 2010);
    expect(result).toHaveLength(11);
  });

  it('данные вне диапазона [start, end] не попадают в результат', () => {
    const data = [{ year: 1900, country: 'China', count: 999 }];
    const result = pivotYearCountrySeries(data, ['China'], 2010, 2020);
    expect(result.every((r) => r.year >= 2010 && r.year <= 2020)).toBe(true);
    expect(result.reduce((s, r) => s + r.China, 0)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// applyMinimumArcFloor
// ---------------------------------------------------------------------------

describe('applyMinimumArcFloor', () => {
  it('не трогает данные, если все сегменты уже выше порога', () => {
    const items = [{ value: 100 }, { value: 100 }, { value: 100 }];
    const result = applyMinimumArcFloor(items, 1.5);
    result.forEach((r, i) => expect(r.renderValue).toBe(items[i].value));
  });

  it('поднимает тонкий сегмент до минимального угла, компенсируя сжатием остальных', () => {
    // 1 из 100000 — угол среза ~0.0036°, заведомо ниже порога 1.5°
    const items = [{ value: 99999 }, { value: 1 }];
    const result = applyMinimumArcFloor(items, 1.5);

    const tinyDegrees = (result[1].renderValue / (result[0].renderValue + result[1].renderValue)) * 360;
    expect(tinyDegrees).toBeCloseTo(1.5, 1);
    // Исходное значение сохраняется — используется в tooltip/подписи
    expect(result[1].value).toBe(1);
  });

  it('сохраняет исходную сумму value после компенсации (иначе ломается выравнивание колец)', () => {
    const items = [{ value: 99999 }, { value: 1 }];
    const result = applyMinimumArcFloor(items, 1.5);
    const originalTotal = items.reduce((s, d) => s + d.value, 0);
    const renderTotal = result.reduce((s, d) => s + d.renderValue, 0);
    expect(renderTotal).toBeCloseTo(originalTotal, 6);
  });

  it('вырожденный случай (пустой массив) не падает', () => {
    expect(applyMinimumArcFloor([], 1.5)).toEqual([]);
  });

  it('вырожденный случай (сумма = 0) возвращает данные без искажений', () => {
    const items = [{ value: 0 }, { value: 0 }];
    const result = applyMinimumArcFloor(items, 1.5);
    expect(result.map((r) => r.renderValue)).toEqual([0, 0]);
  });

  it('сохраняет дополнительные поля объекта (не только value)', () => {
    const items = [{ value: 10, label: 'Article', country: 'China' }];
    const result = applyMinimumArcFloor(items, 1.5);
    expect(result[0].label).toBe('Article');
    expect(result[0].country).toBe('China');
  });
});
