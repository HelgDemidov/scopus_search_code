import { useState, useMemo, useEffect } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import type { Payload } from 'recharts/types/component/DefaultLegendContent';
import { useTranslation } from 'react-i18next';
import { useStatsStore } from '../../stores/statsStore';
import { useTheme } from '../../hooks/useTheme';
import { ChartCard } from '../charts/ChartCard';
import { Slider } from '../ui/slider';
import { AXIS_COLORS, formatAxisTick, formatCount, getYearRangeBounds, pivotYearCountrySeries } from '../charts/chartColors';
import { getCountryColor } from '../../constants/countryColors';
import { YEAR_HARD_MAX, YEAR_MIN_WINDOW } from '../../constants/yearRange';
import { getLabelMaps } from '../../constants/labelTranslations';
import { useMediaQuery } from '../../hooks/useMediaQuery';

// График 1 — Top Countries by Year (docs/explore-cross-analytics/spec.md §4).
// Расширение уже готового пайплайна Publications by Year (тот же year-range slider,
// YEAR_HARD_MAX/zero-fill), но 10 линий (топ-10 стран) вместо одной суммарной.

// Левый край по умолчанию — 2015, отдельно от YEAR_DEFAULT_MIN (2010), который
// использует DimensionDrawer.year. Только для этого графика: с 10 линиями сразу
// видно больше «воздуха» до появления заметного объёма данных, чем на одиночной
// area-серии Publications by Year, поэтому более узкий дефолтный диапазон читается
// лучше (пользователь всё ещё может раздвинуть слайдер до absoluteMin).
const TOP_COUNTRIES_YEAR_DEFAULT_MIN = 2015;

function useTopCountriesData() {
  const stats = useStatsStore((s) => s.stats);
  const data = useMemo(() => stats?.by_year_top_countries ?? [], [stats]);

  // Backend уже вернул ровно топ-10 стран (см. spec.md §2.2) — здесь только
  // восстанавливаем стабильный порядок (по убыванию суммарного объёма) для
  // легенды и назначения цветов; сам список стран не пересчитываем.
  const countries = useMemo(() => {
    const totals = new Map<string, number>();
    for (const d of data) {
      totals.set(d.country, (totals.get(d.country) ?? 0) + d.count);
    }
    return [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([country]) => country);
  }, [data]);

  return { data, countries, isLoading: stats === null };
}

export function TopCountriesByYearChart() {
  const { t, i18n } = useTranslation();
  const { theme } = useTheme();
  const axis = AXIS_COLORS[theme];
  const { data, countries, isLoading } = useTopCountriesData();
  // Тултип показывает по строке на каждую из топ-10 стран — на узком мобильном
  // экране широкий/высокий тултип с крупным шрифтом мог вылезать за правый край
  // viewport, почти закрывая график. Уменьшаем шрифт/паддинг и не даём тултипу
  // выходить за пределы области графика по X (allowEscapeViewBox).
  const isMobile = useMediaQuery('(max-width: 767px)');
  const maps = getLabelMaps(i18n.language);
  const trCountry = (label: string) => (maps ? maps.country[label] ?? label : label);

  const { absoluteMin, defaultStart } = useMemo(
    () =>
      getYearRangeBounds(
        data.map((d) => ({ label: String(d.year), count: d.count })),
        TOP_COUNTRIES_YEAR_DEFAULT_MIN,
      ),
    [data],
  );

  // range инициализируется только после первой загрузки данных (data приходит
  // асинхронно после монтирования компонента — в отличие от DimensionDrawer,
  // который монтируется, только когда stats уже загружен).
  const [range, setRange] = useState<[number, number] | null>(null);
  useEffect(() => {
    if (range === null && data.length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRange([defaultStart, YEAR_HARD_MAX]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.length]);
  const effectiveRange = useMemo<[number, number]>(
    () => range ?? [defaultStart, YEAR_HARD_MAX],
    [range, defaultStart],
  );

  // Кликабельная легенда — toggle видимости серии (см. spec.md §4, §7: Китай на
  // порядок больше остальных стран, скрытие его линии позволяет рассмотреть
  // оставшиеся 9 на менее сжатой шкале).
  const [hiddenCountries, setHiddenCountries] = useState<Set<string>>(new Set());
  function toggleCountry(country: string) {
    setHiddenCountries((prev) => {
      const next = new Set(prev);
      if (next.has(country)) next.delete(country);
      else next.add(country);
      return next;
    });
  }

  const pivoted = useMemo(
    () => pivotYearCountrySeries(data, countries, effectiveRange[0], effectiveRange[1]),
    [data, countries, effectiveRange],
  );

  return (
    <ChartCard title={t('explore.crossCharts.topCountriesByYear')} isLoading={isLoading} skeletonHeight="h-96" translucent>
      <div className="flex flex-col gap-4">
        <ResponsiveContainer width="100%" height={360}>
          <LineChart data={pivoted} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={axis.grid} vertical={false} />
            <XAxis
              dataKey="year"
              tick={{ fontSize: 12, fill: axis.tickMuted }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 12, fill: axis.tickMuted }}
              tickLine={false}
              axisLine={false}
              width={44}
              tickFormatter={(v: number) => formatAxisTick(v, i18n.language)}
            />
            <Tooltip
              formatter={(value: number, name: string) => [formatCount(value), trCountry(name)]}
              allowEscapeViewBox={{ x: false, y: true }}
              contentStyle={{
                borderRadius: 8,
                border: `1px solid ${axis.grid}`,
                backgroundColor: theme === 'dark' ? '#152236' : '#ffffff',
                fontSize: isMobile ? 10 : 13,
                padding: isMobile ? '4px 8px' : undefined,
                maxWidth: isMobile ? 170 : undefined,
              }}
              itemStyle={isMobile ? { padding: 0 } : undefined}
            />
            <Legend
              onClick={(entry: Payload) => toggleCountry(String(entry.dataKey))}
              formatter={(value: string) => trCountry(value)}
              wrapperStyle={{ cursor: 'pointer', fontSize: 12 }}
            />
            {countries.map((country) => (
              <Line
                key={country}
                type="monotone"
                dataKey={country}
                name={country}
                stroke={getCountryColor(country, theme)}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 3 }}
                hide={hiddenCountries.has(country)}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>

        <div className="px-1">
          <div
            data-testid="top-countries-year-range-labels"
            className="flex justify-between text-xs font-medium tabular-nums text-slate-700 dark:text-slate-300 mb-2"
          >
            <span>{effectiveRange[0]}</span>
            <span>{effectiveRange[1]}</span>
          </div>
          <Slider
            aria-label={t('explore.crossCharts.yearRangeLabel')}
            min={absoluteMin}
            max={YEAR_HARD_MAX}
            step={1}
            minStepsBetweenThumbs={YEAR_MIN_WINDOW}
            value={effectiveRange}
            onValueChange={(v: number[]) => setRange([v[0], v[1]])}
          />
        </div>
      </div>
    </ChartCard>
  );
}
