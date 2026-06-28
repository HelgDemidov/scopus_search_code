import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { useTranslation } from 'react-i18next';
import { ChartCard } from './ChartCard';
import { ChartTooltip } from './ChartTooltip';
import { DIMENSION_COLORS, truncateLabel, formatAxisTick } from './chartColors';
import { getLabelMaps } from '../../constants/labelTranslations';
import { useDashboardStore } from '../../stores/dashboardStore';
import type { LabelCount } from '../../types/api';

interface TopCountriesChartProps {
  data: LabelCount[];
  isLoading: boolean;
}

const DIM = 'country';
const colors = DIMENSION_COLORS[DIM];
const TOP_N = 10;

export function TopCountriesChart({ data, isLoading }: TopCountriesChartProps) {
  const { t, i18n } = useTranslation();
  const { activeSelection, filteredStats, setSelection, openDrawer } = useDashboardStore();

  const chartData = [...data]
    .sort((a, b) => b.count - a.count)
    .slice(0, TOP_N)
    .map((d) => ({ ...d, label: truncateLabel(d.label, 24) }));

  function getCellFill(label: string): string {
    // V2 active: filtered data already shows subset → no dimming needed
    if (filteredStats !== null) return colors.base;
    if (!activeSelection || activeSelection.dimension !== DIM) return colors.base;
    return activeSelection.value === label ? colors.selected : colors.dimmed;
  }

  function handleBarClick(entry: LabelCount) {
    setSelection({ dimension: DIM, value: entry.label });
  }

  return (
    <ChartCard
      title={t('explore.dimensions.country')}
      dimension={DIM}
      isLoading={isLoading}
      skeletonHeight="h-72"
      onTitleClick={() => openDrawer(DIM)}
    >
      <ResponsiveContainer width="100%" height={288}>
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 0, right: 16, bottom: 0, left: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />

          <XAxis
            type="number"
            tick={{ fontSize: 11, fill: '#94a3b8' }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => formatAxisTick(v, i18n.language)}
          />

          <YAxis
            type="category"
            dataKey="label"
            width={getLabelMaps(i18n.language) ? 120 : 96}
            tick={{ fontSize: 11, fill: '#64748b' }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: string) => getLabelMaps(i18n.language)?.country[v] ?? v}
          />

          <Tooltip
            content={(p) => <ChartTooltip {...p} dimension={DIM} />}
            cursor={{ fill: 'rgba(148,163,184,0.1)' }}
          />

          <Bar
            dataKey="count"
            radius={[0, 4, 4, 0]}
            cursor="pointer"
            onClick={handleBarClick}
          >
            {chartData.map((entry) => (
              <Cell key={entry.label} fill={getCellFill(entry.label)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
