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
import { ChartCard } from './ChartCard';
import { ChartTooltip } from './ChartTooltip';
import { DIMENSION_COLORS, truncateLabel } from './chartColors';
import { useDashboardStore } from '../../stores/dashboardStore';
import type { LabelCount } from '../../types/api';

interface TopJournalsChartProps {
  data: LabelCount[];
  isLoading: boolean;
}

const DIM = 'journal';
const colors = DIMENSION_COLORS[DIM];
const TOP_N = 10;
const YAXIS_WIDTH = 180;

export function TopJournalsChart({ data, isLoading }: TopJournalsChartProps) {
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

  return (
    <ChartCard
      title="Top Journals"
      dimension={DIM}
      isLoading={isLoading}
      skeletonHeight="h-80"
      onTitleClick={() => openDrawer(DIM)}
    >
      <ResponsiveContainer width="100%" height={320}>
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
            width={YAXIS_WIDTH}
            tick={{ fontSize: 11, fill: '#64748b' }}
            tickLine={false}
            axisLine={false}
          />

          <Tooltip
            content={(p) => <ChartTooltip {...p} dimension={DIM} />}
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
