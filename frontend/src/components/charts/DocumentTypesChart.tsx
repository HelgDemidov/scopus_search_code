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
import { DIMENSION_COLORS, formatAxisTick } from './chartColors';
import { getLabelMaps } from '../../constants/labelTranslations';
import { useDashboardStore } from '../../stores/dashboardStore';
import type { LabelCount } from '../../types/api';

interface DocumentTypesChartProps {
  data: LabelCount[];
  isLoading: boolean;
}

const DIM = 'doc_type';
const colors = DIMENSION_COLORS[DIM];

export function DocumentTypesChart({ data, isLoading }: DocumentTypesChartProps) {
  const { t, i18n } = useTranslation();
  const { activeSelection, filteredStats, setSelection, openDrawer } = useDashboardStore();

  const chartData = [...data].sort((a, b) => b.count - a.count);

  // Высота адаптируется под число типов документов (минимум 192px)
  const chartHeight = Math.max(192, chartData.length * 36);

  function getCellFill(label: string): string {
    if (filteredStats !== null) return colors.base;
    if (!activeSelection || activeSelection.dimension !== DIM) return colors.base;
    return activeSelection.value === label ? colors.selected : colors.dimmed;
  }

  return (
    <ChartCard
      title={t('explore.dimensions.doc_type')}
      dimension={DIM}
      isLoading={isLoading}
      skeletonHeight="h-48"
      onTitleClick={() => openDrawer(DIM)}
    >
      <ResponsiveContainer width="100%" height={chartHeight}>
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
            width={88}
            tick={{ fontSize: 11, fill: '#64748b' }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: string) => getLabelMaps(i18n.language)?.doc_type[v] ?? v}
          />

          <Tooltip
            content={(p) => <ChartTooltip {...p} dimension={DIM} />}
            cursor={{ fill: 'rgba(148,163,184,0.1)' }}
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
