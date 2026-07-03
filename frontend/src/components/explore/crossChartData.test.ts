import { describe, it, expect } from 'vitest';
import { buildRawGroups, computeJournalQuadrants, pivotJournalCountryData } from './crossChartData';
import type { JournalImpactPoint } from '../../types/api';

// ---------------------------------------------------------------------------
// buildRawGroups
// ---------------------------------------------------------------------------

describe('buildRawGroups', () => {
  const data = [
    { country: 'China', open_access: true, count: 80 },
    { country: 'China', open_access: false, count: 10 },
    { country: 'USA', open_access: true, count: 20 },
    { country: 'USA', open_access: false, count: 5 },
  ];

  it('level1 агрегирует суммарный count по стране, отсортировано по убыванию', () => {
    const { level1Raw } = buildRawGroups(data);
    expect(level1Raw).toEqual([
      { country: 'China', value: 90 },
      { country: 'USA', value: 25 },
    ]);
  });

  it('level2 разбивает по open_access внутри страны, пропуская отсутствующие сегменты', () => {
    const { level2Raw } = buildRawGroups(data);
    expect(level2Raw).toEqual([
      { country: 'China', openAccess: true, value: 80 },
      { country: 'China', openAccess: false, value: 10 },
      { country: 'USA', openAccess: true, value: 20 },
      { country: 'USA', openAccess: false, value: 5 },
    ]);
  });

  it('сумма level1 === сумма level2 === grandTotal (инвариант выравнивания колец)', () => {
    const { level1Raw, level2Raw, grandTotal } = buildRawGroups(data);
    const sum = (arr: { value: number }[]) => arr.reduce((s, d) => s + d.value, 0);
    expect(sum(level1Raw)).toBe(grandTotal);
    expect(sum(level2Raw)).toBe(grandTotal);
    expect(grandTotal).toBe(115);
  });

  it('пропускает отсутствующий OA-сегмент (страна только с одним значением open_access)', () => {
    const onlyOpen = [{ country: 'UK', open_access: true, count: 7 }];
    const { level2Raw } = buildRawGroups(onlyOpen);
    expect(level2Raw).toEqual([{ country: 'UK', openAccess: true, value: 7 }]);
  });

  it('пустые данные не падают', () => {
    const result = buildRawGroups([]);
    expect(result.level1Raw).toEqual([]);
    expect(result.level2Raw).toEqual([]);
    expect(result.grandTotal).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// pivotJournalCountryData
// ---------------------------------------------------------------------------

describe('pivotJournalCountryData', () => {
  const data = [
    { journal: 'Nature', country: 'China', count: 30 },
    { journal: 'Nature', country: 'USA', count: 10 },
    { journal: 'Science', country: 'USA', count: 20 },
    { journal: 'Science', country: 'Other', count: 5 },
  ];

  it('journalOrder (неявно через порядок pivoted) — по убыванию суммарного объёма журнала', () => {
    const { pivoted } = pivotJournalCountryData(data);
    expect(pivoted.map((r) => r.journal)).toEqual(['Nature', 'Science']);
  });

  it('countryOrder — "Other" всегда первым (нижний сегмент стека), затем топ-страны по убыванию объёма', () => {
    // China: 30 (Nature), USA: 10+20=30 (Nature+Science) — суммы равны, порядок
    // при равенстве стабилен (China встретилась первой во входных данных).
    const { countryOrder } = pivotJournalCountryData(data);
    expect(countryOrder).toEqual(['Other', 'China', 'USA']);
  });

  it('pivoted содержит 0 для отсутствующих комбинаций (журнал, страна)', () => {
    const { pivoted } = pivotJournalCountryData(data);
    const science = pivoted.find((r) => r.journal === 'Science')!;
    expect(science.China).toBe(0);
  });

  it('"Other" не включён в countryOrder, если ни у одного журнала нет этой страны', () => {
    const noOtherData = [{ journal: 'Nature', country: 'China', count: 10 }];
    const { countryOrder } = pivotJournalCountryData(noOtherData);
    expect(countryOrder).not.toContain('Other');
  });

  it('сумма всех сегментов бара равна исходному суммарному count журнала', () => {
    const { pivoted } = pivotJournalCountryData(data);
    const nature = pivoted.find((r) => r.journal === 'Nature')!;
    const total = (['China', 'USA', 'Other'] as const)
      .map((c) => Number(nature[c] ?? 0))
      .reduce((s, v) => s + v, 0);
    expect(total).toBe(40);
  });

  it('пустые данные не падают', () => {
    const result = pivotJournalCountryData([]);
    expect(result.pivoted).toEqual([]);
    expect(result.countryOrder).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// computeJournalQuadrants (JournalLandscapeScatterChart)
// ---------------------------------------------------------------------------

describe('computeJournalQuadrants', () => {
  function journal(overrides: Partial<JournalImpactPoint>): JournalImpactPoint {
    return { journal: 'J', count: 20, mean_citations: 5, median_citations: 2, ...overrides };
  }

  it('пустые данные не падают', () => {
    const result = computeJournalQuadrants([]);
    expect(result.points).toEqual([]);
    expect(result.medianCount).toBe(0);
    expect(result.medianMean).toBe(0);
  });

  it('делит на 4 квадранта по медианам count/mean_citations выборки', () => {
    const data = [
      journal({ journal: 'Flagship', count: 100, mean_citations: 50 }),
      journal({ journal: 'HiddenGem', count: 10, mean_citations: 50 }),
      journal({ journal: 'VolumeFactory', count: 100, mean_citations: 1 }),
      journal({ journal: 'Peripheral', count: 10, mean_citations: 1 }),
    ];
    const { points } = computeJournalQuadrants(data);
    const byName = Object.fromEntries(points.map((p) => [p.journal, p.quadrant]));

    expect(byName['Flagship']).toBe('flagship');
    expect(byName['HiddenGem']).toBe('hiddenGem');
    expect(byName['VolumeFactory']).toBe('volumeFactory');
    expect(byName['Peripheral']).toBe('peripheral');
  });

  it('точка ровно на медиане по обеим осям — считается "высокой" (>=), попадает в flagship', () => {
    // Нечётное число точек — медиана средней точки равна её собственному значению
    const data = [
      journal({ journal: 'Low', count: 10, mean_citations: 1 }),
      journal({ journal: 'Median', count: 20, mean_citations: 5 }),
      journal({ journal: 'High', count: 30, mean_citations: 9 }),
    ];
    const { points, medianCount, medianMean } = computeJournalQuadrants(data);
    expect(medianCount).toBe(20);
    expect(medianMean).toBe(5);
    const median = points.find((p) => p.journal === 'Median')!;
    expect(median.quadrant).toBe('flagship');
  });

  it('plotMean floor: mean_citations=0 не ломает лог-шкалу, но в точке сохраняется истинное значение', () => {
    const data = [journal({ journal: 'Zero', count: 20, mean_citations: 0 })];
    const { points } = computeJournalQuadrants(data);
    expect(points[0].mean_citations).toBe(0);
    expect(points[0].plotMean).toBeGreaterThan(0);
  });

  it('медиана по чётному числу точек — среднее двух средних значений', () => {
    const data = [
      journal({ count: 10, mean_citations: 1 }),
      journal({ count: 20, mean_citations: 2 }),
      journal({ count: 30, mean_citations: 3 }),
      journal({ count: 40, mean_citations: 4 }),
    ];
    const { medianCount, medianMean } = computeJournalQuadrants(data);
    expect(medianCount).toBe(25); // (20+30)/2
    expect(medianMean).toBe(2.5); // (2+3)/2
  });
});
