import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { useTranslation } from 'react-i18next';
import { ChartCard } from './ChartCard';
import { ChartTooltip } from './ChartTooltip';
import { useDimensionColors } from '../../hooks/useDimensionColors';
import { useTheme } from '../../hooks/useTheme';
import { formatAxisTick } from './chartColors';
import type { LabelCount } from '../../types/api';

interface PublicationsByYearChartProps {
  data: LabelCount[];
  isLoading: boolean;
}

export function PublicationsByYearChart({ data, isLoading }: PublicationsByYearChartProps) {
  const { t, i18n } = useTranslation();
  const colors = useDimensionColors('year');
  const { theme } = useTheme();
  const gridStroke = theme === 'dark' ? '#1e293b' : '#e2e8f0'; // slate-800 / slate-200
  // Сортируем по возрастанию года (бэкенд может отдавать в произвольном порядке)
  const sorted = [...data].sort((a, b) => Number(a.label) - Number(b.label));

  return (
    <ChartCard
      title={t('explore.dimensions.year')}
      dimension="year"
      isLoading={isLoading}
      skeletonHeight="h-56"
    >
      <ResponsiveContainer width="100%" height={224}>
        <AreaChart data={sorted} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
          <defs>
            <linearGradient id="yearGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor={colors.base} stopOpacity={0.25} />
              <stop offset="95%" stopColor={colors.base} stopOpacity={0} />
            </linearGradient>
          </defs>

          <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />

          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: '#94a3b8' }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
          />

          <YAxis
            tick={{ fontSize: 11, fill: '#94a3b8' }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => formatAxisTick(v, i18n.language)}
            width={36}
          />

          <Tooltip
            content={(p) => (
              <ChartTooltip {...p} dimension="year" />
            )}
            cursor={{ stroke: colors.base, strokeWidth: 1, strokeDasharray: '4 4' }}
          />

          <Area
            type="monotone"
            dataKey="count"
            stroke={colors.base}
            strokeWidth={2}
            fill="url(#yearGradient)"
            dot={false}
            activeDot={{ r: 4, fill: colors.base }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
