import {
  ComposedChart,
  Bar,
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
import { ChartCard } from '../charts/ChartCard';
import { useTheme } from '../../hooks/useTheme';
import { AXIS_COLORS, DIMENSION_COLORS, formatCount, formatAxisTick } from '../charts/chartColors';
import type { PersonalActivityResponse } from '../../types/api';

// Поисковая активность пользователя по времени (docs/explore-personal-redesign/
// spec.md §2.1) — автобиографический разрез, которого нет ни в collection, ни
// в старом personal-наборе: у collection нет понятия "время поиска" вообще.
// Комбо: stacked-бар (successful/zero-result поиски за период) + линия
// накопления УНИКАЛЬНЫХ статей (не суммарный result_count — иначе повторные
// похожие поиски задваивали бы рост, см. бэкенд get_personal_activity_for_user).

const SUCCESSFUL_COLOR = DIMENSION_COLORS.year.base; // blue-600 — тот же тон, что Publications by Year
// amber-600 — приглушённый акцент, НЕ error-red: это поведение пользователя (потраченная
// впустую квота), а не ошибка приложения. Экспортируется — FilterFingerprintStrip
// переиспользует тот же цвет для своего zero-result маркера (единый визуальный сигнал
// между обоими разрезами автобиографического раздела, spec.md §2.2).
export const ZERO_RESULT_COLOR = '#d97706';
const CUMULATIVE_LINE_COLOR = DIMENSION_COLORS.open_access.base; // teal-600 — визуально отделяет линию от баров

function formatPeriodLabel(periodStart: string, granularity: 'week' | 'month', lang: string): string {
  const d = new Date(`${periodStart}T00:00:00Z`);
  if (granularity === 'month') {
    return new Intl.DateTimeFormat(lang, { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(d);
  }
  return new Intl.DateTimeFormat(lang, { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(d);
}

interface ActivityTooltipPayloadItem {
  successful_searches: number;
  zero_result_searches: number;
  cumulative_unique_articles: number;
}

interface ActivityTooltipProps {
  active?: boolean;
  payload?: readonly unknown[];
  label?: string;
}

function ActivityTooltip({ active, payload, label }: ActivityTooltipProps) {
  const { t } = useTranslation();
  if (!active || !payload?.length) return null;
  const row = (payload[0] as { payload?: ActivityTooltipPayloadItem } | undefined)?.payload;
  if (!row) return null;

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#152236] px-3 py-2 shadow-lg text-sm">
      <p className="font-medium text-slate-900 dark:text-slate-100 mb-1">{label}</p>
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: SUCCESSFUL_COLOR }} />
          <span className="text-slate-500 dark:text-slate-400">{t('explore.personal.activity.legendSuccessful')}:</span>
          <span className="font-semibold text-slate-900 dark:text-slate-100">{formatCount(row.successful_searches)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: ZERO_RESULT_COLOR }} />
          <span className="text-slate-500 dark:text-slate-400">{t('explore.personal.activity.legendZeroResult')}:</span>
          <span className="font-semibold text-slate-900 dark:text-slate-100">{formatCount(row.zero_result_searches)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: CUMULATIVE_LINE_COLOR }} />
          <span className="text-slate-500 dark:text-slate-400">{t('explore.personal.activity.legendCumulative')}:</span>
          <span className="font-semibold text-slate-900 dark:text-slate-100">{formatCount(row.cumulative_unique_articles)}</span>
        </div>
      </div>
    </div>
  );
}

// Кастомный Legend content — тот же приём, что JournalCountryLegend
// (TopJournalsByCountryChart.tsx): Recharts DefaultLegendContent даёт
// фиксированный ~10px зазор между пунктами (жёстко зашит инлайн-стилем), при
// 3 пунктах на карточке средней ширины смотрелось тесно (post-prod fix, §14.2).
function ActivityLegend({ payload }: { payload?: Payload[] }) {
  const { t } = useTranslation();
  if (!payload?.length) return null;
  const labelFor = (key: string): string => {
    if (key === 'successful_searches') return t('explore.personal.activity.legendSuccessful');
    if (key === 'zero_result_searches') return t('explore.personal.activity.legendZeroResult');
    if (key === 'cumulative_unique_articles') return t('explore.personal.activity.legendCumulative');
    return key;
  };
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-1.5 text-xs text-slate-600 dark:text-slate-300 pt-2">
      {payload.map((entry) => (
        <span key={String(entry.value)} className="flex items-center gap-1.5 whitespace-nowrap">
          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: entry.color }} />
          {labelFor(String(entry.value))}
        </span>
      ))}
    </div>
  );
}

interface PersonalActivityChartProps {
  data: PersonalActivityResponse | null;
  isLoading: boolean;
}

export function PersonalActivityChart({ data, isLoading }: PersonalActivityChartProps) {
  const { t, i18n } = useTranslation();
  const { theme } = useTheme();
  const axis = AXIS_COLORS[theme];

  const granularity = data?.granularity ?? 'week';
  const subtitle = granularity === 'month'
    ? t('explore.personal.activity.subtitleMonth')
    : t('explore.personal.activity.subtitleWeek');

  const chartData = (data?.buckets ?? []).map((b) => ({
    ...b,
    label: formatPeriodLabel(b.period_start, granularity, i18n.language),
  }));

  return (
    <ChartCard
      title={`${t('explore.personal.activity.title')} — ${subtitle}`}
      isLoading={isLoading}
      skeletonHeight="h-80"
    >
      {chartData.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400 py-8 text-center">
          {t('explore.personal.activity.empty')}
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={320}>
          <ComposedChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="35%">
            <CartesianGrid strokeDasharray="3 3" stroke={axis.grid} vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 12, fill: axis.tickMuted }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              yAxisId="left"
              tick={{ fontSize: 12, fill: axis.tickMuted }}
              tickLine={false}
              axisLine={false}
              width={36}
              allowDecimals={false}
              tickFormatter={(v: number) => formatAxisTick(v, i18n.language)}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fontSize: 12, fill: axis.tickMuted }}
              tickLine={false}
              axisLine={false}
              width={36}
              allowDecimals={false}
              tickFormatter={(v: number) => formatAxisTick(v, i18n.language)}
            />
            <Tooltip content={(p) => <ActivityTooltip {...p} />} cursor={{ fill: 'rgba(148,163,184,0.1)' }} />
            <Legend content={(props) => <ActivityLegend payload={props.payload} />} />
            <Bar
              yAxisId="left"
              dataKey="successful_searches"
              stackId="searches"
              fill={SUCCESSFUL_COLOR}
              radius={[0, 0, 0, 0]}
              maxBarSize={32}
            />
            <Bar
              yAxisId="left"
              dataKey="zero_result_searches"
              stackId="searches"
              fill={ZERO_RESULT_COLOR}
              radius={[4, 4, 0, 0]}
              maxBarSize={32}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="cumulative_unique_articles"
              stroke={CUMULATIVE_LINE_COLOR}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}
