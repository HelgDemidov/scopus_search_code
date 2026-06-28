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
import { DIMENSION_COLORS, truncateLabel } from './chartColors';
import { useDashboardStore } from '../../stores/dashboardStore';
import type { LabelCount } from '../../types/api';

interface TopAuthorsChartProps {
  data: LabelCount[];
  isLoading: boolean;
}

const DIM = 'author';
const colors = DIMENSION_COLORS[DIM];
const TOP_N = 15;

export function TopAuthorsChart({ data, isLoading }: TopAuthorsChartProps) {
  const { t } = useTranslation();
  const { activeSelection, filteredStats, setSelection, openDrawer } = useDashboardStore();

  const chartData = [...data]
    .sort((a, b) => b.count - a.count)
    .slice(0, TOP_N)
    .map((d) => ({ ...d, label: truncateLabel(d.label, 28) }));

  function getCellFill(label: string): string {
    if (filteredStats !== null) return colors.base;
    if (!activeSelection || activeSelection.dimension !== DIM) return colors.base;
    return activeSelection.value === label ? colors.selected : colors.dimmed;
  }

  if (data.length === 0 && !isLoading) {
    return (
      <ChartCard title="Top Authors" dimension={DIM} isLoading={false}>
        <div className="flex h-48 items-center justify-center">
          <p className="text-xs text-slate-400 dark:text-slate-500">No author data available</p>
        </div>
      </ChartCard>
    );
  }

  return (
    <ChartCard
      title={t('explore.dimensions.author')}
      dimension={DIM}
      isLoading={isLoading}
      skeletonHeight="h-[360px]"
      onTitleClick={() => openDrawer(DIM)}
    >
      <ResponsiveContainer width="100%" height={360}>
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
            tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
          />

          <YAxis
            type="category"
            dataKey="label"
            width={180}
            tick={{ fontSize: 10, fill: '#64748b' }}
            tickLine={false}
            axisLine={false}
          />

          <Tooltip
            content={(p) => (
              <ChartTooltip {...p} dimension={DIM} valueLabel="Articles" />
            )}
            cursor={{ fill: '#f1f5f9' }}
          />

          <Bar
            dataKey="count"
            radius={[0, 4, 4, 0]}
            cursor="pointer"
            onClick={(entry: LabelCount) => setSelection({ dimension: DIM, value: entry.label })}
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
