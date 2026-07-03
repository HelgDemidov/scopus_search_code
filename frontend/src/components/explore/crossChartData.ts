// Чистые функции подготовки данных для CountrySunburstChart/TopJournalsByCountryChart —
// вынесены из компонентов в отдельный файл (не chartColors.ts: это не переиспользуемые
// dataviz-утилиты, а разовая подготовка формы данных под конкретные 2 графика), чтобы
// react-refresh/only-export-components не предупреждал на экспорт функций из файла
// компонента (тот же паттерн, что CHART_TYPE_LABELS вынесен в chartColors.ts, а не
// оставлен в DynamicChart.tsx — см. frontend/CLAUDE.md).

import type { JournalCountryCount, SunburstSegment } from '../../types/api';

// ---------------------------------------------------------------------------
// CountrySunburstChart — группировка Country → OpenAccess (упрощено с 3 до 2
// уровней по итогам визуального ревью: DocType как промежуточный слой убран —
// был визуально нечитаем и ломал выравнивание границ колец).
// ---------------------------------------------------------------------------

/**
 * Группирует плоский SunburstSegment[] в 2 уровня для вложенных Pie-колец.
 * Порядок стран — фиксированная последовательность (по убыванию суммарного
 * объёма), единая для обоих колец: Recharts авто-выравнивает вложенные Pie,
 * только если дочернее кольцо сгруппировано в том же порядке, что и
 * родительское, И суммы значений колец совпадают (см. spec.md §3.3) — поэтому
 * paddingAngle обязан быть одинаковым (=0) на обоих кольцах, иначе разное
 * количество сегментов даёт разный суммарный «отступ», съедаемый из 360°
 * бюджета, и кольца расходятся (эмпирически обнаруженная причина рассинхрона
 * границ в первой версии с 3 уровнями).
 */
export function buildRawGroups(data: SunburstSegment[]) {
  const countryTotals = new Map<string, number>();
  for (const d of data) {
    countryTotals.set(d.country, (countryTotals.get(d.country) ?? 0) + d.count);
  }
  const countryOrder = [...countryTotals.keys()].sort((a, b) => countryTotals.get(b)! - countryTotals.get(a)!);
  const grandTotal = data.reduce((s, d) => s + d.count, 0);

  const level1Raw = countryOrder.map((country) => ({
    country,
    value: countryTotals.get(country)!,
  }));

  const level2Raw: { country: string; openAccess: boolean; value: number }[] = [];
  for (const country of countryOrder) {
    for (const openAccess of [true, false]) {
      const seg = data.find((d) => d.country === country && d.open_access === openAccess);
      if (seg && seg.count > 0) level2Raw.push({ country, openAccess, value: seg.count });
    }
  }

  return { level1Raw, level2Raw, grandTotal };
}

// ---------------------------------------------------------------------------
// TopJournalsByCountryChart — pivot в wide-формат для stacked BarChart
// ---------------------------------------------------------------------------

/**
 * journalOrder — по убыванию суммарного объёма (backend уже вернул только топ-10,
 * здесь только восстанавливаем стабильный порядок для оси X).
 * countryOrder — "Other" ПЕРВЫМ (нижний сегмент стека — первый элемент рендерится
 * первым в Recharts stacked Bar, т.е. снизу), затем топ-5 по убыванию общего объёма.
 */
export function pivotJournalCountryData(data: JournalCountryCount[]) {
  const journalTotals = new Map<string, number>();
  const countryTotals = new Map<string, number>();
  for (const d of data) {
    journalTotals.set(d.journal, (journalTotals.get(d.journal) ?? 0) + d.count);
    if (d.country !== 'Other') countryTotals.set(d.country, (countryTotals.get(d.country) ?? 0) + d.count);
  }
  const journalOrder = [...journalTotals.keys()].sort((a, b) => journalTotals.get(b)! - journalTotals.get(a)!);
  const countryOrderTop5 = [...countryTotals.keys()].sort((a, b) => countryTotals.get(b)! - countryTotals.get(a)!);
  const hasOther = data.some((d) => d.country === 'Other');
  const countryOrder = hasOther ? ['Other', ...countryOrderTop5] : countryOrderTop5;

  const countByJournalCountry = new Map<string, number>();
  for (const d of data) countByJournalCountry.set(`${d.journal}|${d.country}`, d.count);

  const pivoted = journalOrder.map((journal) => {
    const row: { journal: string; [country: string]: string | number } = { journal };
    for (const country of countryOrder) {
      row[country] = countByJournalCountry.get(`${journal}|${country}`) ?? 0;
    }
    return row;
  });

  return { countryOrder, pivoted };
}
