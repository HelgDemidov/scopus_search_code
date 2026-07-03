import { describe, it, expect } from 'vitest';
import { getCountryColor } from './countryColors';

describe('getCountryColor', () => {
  it('возвращает валидную HSL-строку', () => {
    expect(getCountryColor('China', 'dark')).toMatch(/^hsl\(-?[\d.]+, \d+%, \d+%\)$/);
  });

  it('стабилен для одной и той же страны при повторных вызовах', () => {
    const a = getCountryColor('Brazil', 'light');
    const b = getCountryColor('Brazil', 'light');
    expect(a).toBe(b);
  });

  it('разные страны из приоритетного списка получают разные оттенки', () => {
    const china = getCountryColor('China', 'dark');
    const usa = getCountryColor('United States', 'dark');
    const india = getCountryColor('India', 'dark');
    expect(new Set([china, usa, india]).size).toBe(3);
  });

  it('страна вне приоритетного списка тоже получает детерминированный цвет (hash-fallback)', () => {
    const a = getCountryColor('Nauru', 'dark');
    const b = getCountryColor('Nauru', 'dark');
    expect(a).toBe(b);
    expect(a).toMatch(/^hsl\(/);
  });

  it('одна и та же страна отличается по светлоте между темами (контраст к фону своей темы)', () => {
    const light = getCountryColor('China', 'light');
    const dark = getCountryColor('China', 'dark');
    expect(light).not.toBe(dark);
  });

  it('не зависит от позиции в топ-N — только от названия страны', () => {
    // Тот же принцип, что и позиционная независимость: вызов с одной и той же строкой
    // всегда даёт один и тот же цвет вне зависимости от того, где вызывающий код взял
    // эту страну (топ-5 sunburst или топ-10 графика 1).
    const fromTop10Context = getCountryColor('South Korea', 'dark');
    const fromTop5Context = getCountryColor('South Korea', 'dark');
    expect(fromTop10Context).toBe(fromTop5Context);
  });
});
