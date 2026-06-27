import { renderHook } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useDimensionColors } from './useDimensionColors';
import { DIMENSION_COLORS } from '../components/charts/chartColors';
import type { Dimension } from '../components/charts/chartColors';
import { ThemeProvider } from '../components/theme/ThemeProvider';

function mockMedia(prefersColorSchemeDark = false) {
  vi.stubGlobal('matchMedia', vi.fn().mockImplementation((q: string) => ({
    matches: q === '(prefers-color-scheme: dark)' ? prefersColorSchemeDark : false,
    media: q,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as MediaQueryList)));
}

const DIMENSIONS: Dimension[] = ['year', 'country', 'doc_type', 'journal', 'open_access', 'author'];

describe('useDimensionColors', () => {
  beforeEach(() => {
    localStorage.clear();
    mockMedia();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('возвращает светлые цвета без ThemeProvider (нулевая регрессия)', () => {
    const { result } = renderHook(() => useDimensionColors('year'));
    expect(result.current.dimmed).toBe(DIMENSION_COLORS.year.dimmed);
    expect(result.current.base).toBe(DIMENSION_COLORS.year.base);
  });

  // Light mode: dimmed = стандартный светлый (для каждого измерения)
  it.each(DIMENSIONS)('light mode: %s — dimmed совпадает с DIMENSION_COLORS', (dim) => {
    localStorage.setItem('theme', 'light');
    const { result } = renderHook(() => useDimensionColors(dim), { wrapper: ThemeProvider });
    expect(result.current.dimmed).toBe(DIMENSION_COLORS[dim].dimmed);
  });

  // Dark mode: dimmed = darkDimmed (для каждого измерения)
  it.each(DIMENSIONS)('dark mode: %s — dimmed равен darkDimmed', (dim) => {
    localStorage.setItem('theme', 'dark');
    const { result } = renderHook(() => useDimensionColors(dim), { wrapper: ThemeProvider });
    expect(result.current.dimmed).toBe(DIMENSION_COLORS[dim].darkDimmed);
  });

  it('base/hover/selected/label не меняются в dark mode', () => {
    localStorage.setItem('theme', 'dark');
    const { result } = renderHook(() => useDimensionColors('country'), { wrapper: ThemeProvider });
    expect(result.current.base).toBe(DIMENSION_COLORS.country.base);
    expect(result.current.hover).toBe(DIMENSION_COLORS.country.hover);
    expect(result.current.selected).toBe(DIMENSION_COLORS.country.selected);
    expect(result.current.label).toBe(DIMENSION_COLORS.country.label);
  });
});
