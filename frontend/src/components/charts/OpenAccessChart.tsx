import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useTranslation } from 'react-i18next';
import { ChartCard } from './ChartCard';
import { ChartTooltip } from './ChartTooltip';
import { DIMENSION_COLORS, formatCount } from './chartColors';
import { getLabelMaps } from '../../constants/labelTranslations';
import { useTheme } from '../../hooks/useTheme';

interface OpenAccessChartProps {
  totalArticles: number;
  openAccessCount: number;
  isLoading: boolean;
}

const DIM = 'open_access';
const colors = DIMENSION_COLORS[DIM];
const CLOSED_COLOR = '#94a3b8'; // slate-400

// Кастомная метка в центре donut (КПЧА)
function DonutLabel({
  cx,
  cy,
  oaPercent,
  isDark,
}: {
  cx: number;
  cy: number;
  oaPercent: number;
  isDark: boolean;
}) {
  const valueFill = isDark ? '#f1f5f9' : '#0f172a';
  const labelFill = isDark ? '#94a3b8' : '#64748b';
  return (
    <g>
      <text x={cx} y={cy - 6} textAnchor="middle" fill={valueFill} fontSize={22} fontWeight={700}>
        {oaPercent.toFixed(0)}%
      </text>
      <text x={cx} y={cy + 14} textAnchor="middle" fill={labelFill} fontSize={11}>
        Open Access
      </text>
    </g>
  );
}

export function OpenAccessChart({ totalArticles, openAccessCount, isLoading }: OpenAccessChartProps) {
  const { t, i18n } = useTranslation();
  const { theme } = useTheme();
  const closedCount = totalArticles - openAccessCount;
  const oaLabel = (key: string) => getLabelMaps(i18n.language)?.oa[key] ?? key;
  const oaPercent = totalArticles > 0 ? (openAccessCount / totalArticles) * 100 : 0;

  const chartData = [
    { label: oaLabel('Open Access'), count: openAccessCount },
    { label: oaLabel('Closed Access'), count: closedCount },
  ];

  const segmentColors = [colors.base, CLOSED_COLOR];

  return (
    <ChartCard
      title={t('explore.dimensions.open_access')}
      dimension={DIM}
      isLoading={isLoading}
      skeletonHeight="h-56"
    >
      <ResponsiveContainer width="100%" height={224}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="45%"
            innerRadius="52%"
            outerRadius="72%"
            dataKey="count"
            startAngle={90}
            endAngle={-270}
            paddingAngle={2}
          >
            {chartData.map((_, i) => (
              <Cell key={i} fill={segmentColors[i]} />
            ))}
            {/* Центральная подпись: процент OA */}
            <DonutLabel cx={0} cy={0} oaPercent={oaPercent} isDark={theme === 'dark'} />
          </Pie>

          <Tooltip
            content={(p) => <ChartTooltip {...p} dimension={DIM} />}
          />

          <Legend
            iconType="circle"
            iconSize={8}
            formatter={(value, entry) => {
              const count = (entry.payload as { count: number } | undefined)?.count ?? 0;
              return (
                <span className="text-xs text-slate-600 dark:text-slate-400">
                  {value} ({formatCount(count)})
                </span>
              );
            }}
          />
        </PieChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
