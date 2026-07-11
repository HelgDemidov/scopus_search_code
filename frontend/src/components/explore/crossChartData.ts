// Чистые функции подготовки данных для CountrySunburstChart/TopJournalsByCountryChart/
// JournalLandscapeScatterChart — вынесены из компонентов в отдельный файл (не
// chartColors.ts: это не переиспользуемые dataviz-утилиты, а разовая подготовка формы
// данных под конкретные графики), чтобы react-refresh/only-export-components не
// предупреждал на экспорт функций из файла компонента (тот же паттерн, что было
// с CHART_TYPE_LABELS, вынесенным в chartColors.ts, а не оставленным в
// удалённом DynamicChart.tsx — см. frontend/CLAUDE.md).

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

// ---------------------------------------------------------------------------
// JournalLandscapeScatterChart / CountryImpactScatterChart — квадранты объём×импакт
// (docs/explore-table-builder/spec.md §1, обобщено для CountryImpactPoint в
// docs/impact-analytics/spec.md §2.2 — единственный call site на момент обобщения
// переименован без alias/back-compat).
// ---------------------------------------------------------------------------

export type ImpactQuadrant = 'flagship' | 'hiddenGem' | 'volumeFactory' | 'peripheral';

// Пересечение (не отдельное поле data) — сохраняет плоский доступ к исходным полям
// (point.journal/point.country и т.п.), как было в JournalScatterPoint до обобщения.
export type ImpactScatterPoint<T> = T & {
  quadrant: ImpactQuadrant;
  // Y-позиция на графике: log-шкала не принимает 0 — для точек с mean_citations=0
  // (статистически возможно даже при большом N) используем пол LOG_SCALE_FLOOR только
  // для координаты; tooltip показывает истинное mean_citations, не plotMean.
  plotMean: number;
};

const LOG_SCALE_FLOOR = 0.1;

function median(sortedAsc: number[]): number {
  const mid = Math.floor(sortedAsc.length / 2);
  return sortedAsc.length % 2 !== 0 ? sortedAsc[mid] : (sortedAsc[mid - 1] + sortedAsc[mid]) / 2;
}

/**
 * Делит точки (журналы/страны) на 4 квадранта по медианам count/mean_citations
 * ТЕКУЩЕЙ выборки (той же top-N, что вернул бэкенд) — не по всей коллекции.
 * Совпадающие с медианой значения считаются "высокими" (>=), поэтому ровно на
 * медиане точка попадает в flagship/volumeFactory, а не смещается в противоположный
 * квадрант при чётном числе точек.
 */
export function computeImpactQuadrants<T extends { count: number; mean_citations: number }>(
  data: T[],
): {
  points: ImpactScatterPoint<T>[];
  medianCount: number;
  medianMean: number;
} {
  if (data.length === 0) return { points: [], medianCount: 0, medianMean: 0 };

  const medianCount = median([...data.map((d) => d.count)].sort((a, b) => a - b));
  const medianMean = median([...data.map((d) => d.mean_citations)].sort((a, b) => a - b));

  const points = data.map((d) => {
    const highVolume = d.count >= medianCount;
    const highImpact = d.mean_citations >= medianMean;
    const quadrant: ImpactQuadrant =
      highVolume && highImpact
        ? 'flagship'
        : !highVolume && highImpact
          ? 'hiddenGem'
          : highVolume && !highImpact
            ? 'volumeFactory'
            : 'peripheral';
    return { ...d, quadrant, plotMean: Math.max(d.mean_citations, LOG_SCALE_FLOOR) };
  });

  return { points, medianCount, medianMean: Math.max(medianMean, LOG_SCALE_FLOOR) };
}

// ---------------------------------------------------------------------------
// Отступ по краям оси scatter-графиков (JournalLandscapeScatterChart/
// CountryImpactScatterChart) — без него датапоинты на экстремумах (мин/макс
// выборки) оказываются ровно на границе plot area и обрезаются в полукруг
// SVG-клипом Recharts. Две версии — множитель для лог-шкалы (постоянный
// зазор в лог-пространстве вне зависимости от масштаба значений) и доля
// диапазона для линейной (абсолютное число выглядело бы то избыточным, то
// недостаточным на разных масштабах данных).
// ---------------------------------------------------------------------------

const LOG_DOMAIN_PAD_FACTOR = 1.1;
const LINEAR_DOMAIN_PAD_RATIO = 0.08;

export function padLogDomain(min: number, max: number): [number, number] {
  if (min <= 0) return [min, max * LOG_DOMAIN_PAD_FACTOR]; // лог-шкала не принимает <= 0 — не делить на 0
  return [min / LOG_DOMAIN_PAD_FACTOR, max * LOG_DOMAIN_PAD_FACTOR];
}

export function padLinearDomain(min: number, max: number): [number, number] {
  const range = max - min;
  const pad = range > 0 ? range * LINEAR_DOMAIN_PAD_RATIO : Math.abs(min || 1) * LINEAR_DOMAIN_PAD_RATIO;
  return [min - pad, max + pad];
}

// ---------------------------------------------------------------------------
// Явные тики для лог-оси X CountryImpactScatterChart (docs/impact-analytics/
// spec.md) — без них Recharts не гарантированно ставит подпись на самом
// экстремальном датапоинте (домен растянут на много порядков: Китай на
// порядок опережает следующую страну). min/max выборки — ВСЕГДА в списке, это
// и есть цель: подпись строго на границах данных, плюс "круглые" промежуточные
// значения (1/2/5 × 10^n) для читаемости между ними.
// ---------------------------------------------------------------------------

export function computeLogAxisTicks(values: number[]): number[] {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min <= 0 || min === max) return [...new Set([min, max])];

  const ticks = new Set<number>([min, max]);
  const minExp = Math.floor(Math.log10(min));
  const maxExp = Math.ceil(Math.log10(max));
  for (let exp = minExp; exp <= maxExp; exp++) {
    for (const mult of [1, 2, 5]) {
      const value = mult * 10 ** exp;
      if (value > min && value < max) ticks.add(value);
    }
  }
  return [...ticks].sort((a, b) => a - b);
}
