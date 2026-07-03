// Стабильная привязка цвета к НАЗВАНИЮ страны (не к позиции в топ-N) — используется
// графиками /explore, показывающими несколько стран одновременно: TopCountriesByYearChart
// (топ-10), CountrySunburstChart и TopJournalsByCountryChart (топ-5, подмножество той же
// палитры — см. docs/explore-cross-analytics/spec.md §3.2).
//
// Топ-N стран — результат живого запроса к БД, не константа: при повторном сидинге
// ранжирование может немного сдвинуться. Если бы цвет назначался по индексу в
// отсортированном массиве (allCountries[i] → palette[i]), страна меняла бы цвет между
// визитами каждый раз, когда её ранг сдвигается — это путает пользователя, сравнивающего
// дашборд во времени. Поэтому цвет закреплён за строкой названия страны напрямую.

// Золотой угол — стандартный приём генерации хорошо различимых оттенков без ручного
// подбора: каждый следующий hue в последовательности максимально далёк от всех предыдущих.
const GOLDEN_ANGLE_DEG = 137.50776405003785;

// Приоритетный список стран, типично доминирующих в Scopus-выборках (порядок — не
// динамическое ранжирование данных, а фиксированная последовательность в коде: даёт
// разным странам заведомо разнесённые по золотому углу оттенки). Список исчерпывающим
// быть не обязан — для стран вне списка есть hash-fallback ниже (см. getCountryHue).
const COUNTRY_PRIORITY: readonly string[] = [
  'China', 'United States', 'India', 'United Kingdom', 'South Korea',
  'Germany', 'Japan', 'Australia', 'Canada', 'France',
  'Italy', 'Spain', 'Brazil', 'Russian Federation', 'Iran',
  'Saudi Arabia', 'Malaysia', 'Indonesia', 'Turkey', 'Poland',
  'Netherlands', 'Sweden', 'Switzerland', 'Egypt', 'Pakistan',
  'Taiwan', 'Singapore', 'Mexico', 'Nigeria', 'South Africa',
];

const PRIORITY_HUE_BY_COUNTRY: Record<string, number> = Object.fromEntries(
  COUNTRY_PRIORITY.map((country, i) => [country, (i * GOLDEN_ANGLE_DEG) % 360]),
);

// Простой детерминированный хэш строки (djb2) — фоллбэк для стран вне COUNTRY_PRIORITY.
// Не гарантирует такой же перцептивной разнесённости, как золотой угол по списку, но
// это редкий путь (страна вне топ-30 по публикациям Scopus едва ли окажется в топ-10
// одновременно с другой такой же редкой страной).
function hashStringToHue(s: string): number {
  let hash = 5381;
  for (let i = 0; i < s.length; i++) {
    hash = (hash * 33) ^ s.charCodeAt(i);
  }
  return Math.abs(hash) % 360;
}

function getCountryHue(country: string): number {
  return PRIORITY_HUE_BY_COUNTRY[country] ?? hashStringToHue(country);
}

// Насыщенность/светлота — единая пара на тему (не за страну), контрастная к фону
// панели своей темы: dark — фон #0d1b2a/поверхность #152236 (см. project_dark_mode),
// light — белый/slate-50. Та же логика "яркий на фоне своей темы", что и
// DIMENSION_COLORS/getRankedBarColor в chartColors.ts.
const SATURATION_LIGHTNESS: Record<'light' | 'dark', { s: number; l: number }> = {
  light: { s: 65, l: 42 },
  dark:  { s: 70, l: 62 },
};

/**
 * Цвет страны для графиков, показывающих несколько стран одновременно
 * (TopCountriesByYearChart/CountrySunburstChart/TopJournalsByCountryChart).
 * Один и тот же hue для страны во всех трёх графиках (топ-5 sunburst/графика 3 —
 * подмножество той же палитры, что топ-10 графика 1) — светлота/насыщенность
 * фиксированы на тему, не варьируются по контексту (см. spec.md §3.2: "оговорка на
 * контрастность" пользователя относится к допустимости небольших отличий, но здесь
 * единой пары s/l на тему достаточно для контраста и в тонких дугах, и в широких линиях).
 */
export function getCountryColor(country: string, theme: 'light' | 'dark'): string {
  const hue = getCountryHue(country);
  const { s, l } = SATURATION_LIGHTNESS[theme];
  return `hsl(${hue.toFixed(1)}, ${s}%, ${l}%)`;
}

// Сдвиг светлоты для "дочернего" оттенка того же hue, что и родительский сегмент —
// используется в CountrySunburstChart: самый крупный OpenAccess-сегмент страны
// наследует ровно getCountryColor(), второй сегмент — тот же hue/насыщенность,
// но светлота сдвинута к контрастной точке темы (белый в dark, чёрный в light),
// частично — остаётся "близким по спектру" к материнскому цвету, не превращается
// в отдельный несвязанный оттенок (см. docs/explore-cross-analytics/spec.md §2.4).
const MINOR_VARIANT_LIGHTNESS_DELTA: Record<'light' | 'dark', number> = {
  light: -16,
  dark: 16,
};

export function getCountryColorVariant(
  country: string,
  theme: 'light' | 'dark',
  variant: 'major' | 'minor',
): string {
  const hue = getCountryHue(country);
  const { s, l } = SATURATION_LIGHTNESS[theme];
  if (variant === 'major') return `hsl(${hue.toFixed(1)}, ${s}%, ${l}%)`;
  const minorL = Math.max(12, Math.min(88, l + MINOR_VARIANT_LIGHTNESS_DELTA[theme]));
  return `hsl(${hue.toFixed(1)}, ${s}%, ${minorL}%)`;
}
