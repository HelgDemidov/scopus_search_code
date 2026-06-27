import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Legend,
} from 'recharts';
import { ChartCard } from './ChartCard';
import { ChartTooltip } from './ChartTooltip';
import { DIMENSION_COLORS, CHART_TYPE_LABELS, formatCount, truncateLabel } from './chartColors';
import type { Dimension, ChartType } from './chartColors';
import type { BuilderCard } from '../../stores/dashboardStore';
import { useStatsStore } from '../../stores/statsStore';
import type { LabelCount, StatsResponse } from '../../types/api';

// ---------------------------------------------------------------------------
// Константы
// ---------------------------------------------------------------------------

// Многоцветная палитра для pie-чартов (сегменты разных цветов)
const PIE_PALETTE = [
  '#2563eb', '#16a34a', '#7c3aed', '#d97706', '#0d9488',
  '#e11d48', '#0891b2', '#64748b', '#b45309', '#4338ca',
];

// ---------------------------------------------------------------------------
// Получение данных для измерения из StatsResponse
// ---------------------------------------------------------------------------

function getDataForDimension(dim: Dimension, stats: StatsResponse): LabelCount[] {
  switch (dim) {
    case 'year':
      return [...stats.by_year].sort((a, b) => Number(a.label) - Number(b.label));
    case 'country':
      return [...stats.by_country].sort((a, b) => b.count - a.count);
    case 'doc_type':
      return [...stats.by_doc_type].sort((a, b) => b.count - a.count);
    case 'journal':
      return [...stats.by_journal].sort((a, b) => b.count - a.count);
    case 'open_access':
      return [
        { label: 'Open Access',   count: stats.open_access_count },
        { label: 'Closed Access', count: stats.total_articles - stats.open_access_count },
      ];
    case 'author':
      return [...stats.top_authors].sort((a, b) => b.count - a.count);
  }
}

// Лимиты отображаемых элементов по типу чарта
function sliceForType(data: LabelCount[], chartType: ChartType): LabelCount[] {
  switch (chartType) {
    case 'bar_h':  return data.slice(0, 10);
    case 'bar_v':  return data.slice(0, 8);
    case 'pie':    return data.slice(0, 6);
    case 'line':   return data; // год — полный ряд
    case 'table':  return data.slice(0, 20);
  }
}

// ---------------------------------------------------------------------------
// Вложенные рендереры по типу чарта
// ---------------------------------------------------------------------------

function HorizontalBar({ data, dim }: { data: LabelCount[]; dim: Dimension }) {
  const colors = DIMENSION_COLORS[dim];
  const height = Math.max(192, data.length * 32);
  const truncated = data.map((d) => ({ ...d, label: truncateLabel(d.label, 26) }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={truncated} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }}>
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
          width={110}
          tick={{ fontSize: 11, fill: '#64748b' }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip content={(p) => <ChartTooltip {...p} dimension={dim} />} cursor={{ fill: '#f1f5f9' }} />
        <Bar dataKey="count" fill={colors.base} radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function VerticalBar({ data, dim }: { data: LabelCount[]; dim: Dimension }) {
  const colors = DIMENSION_COLORS[dim];
  const truncated = data.map((d) => ({ ...d, label: truncateLabel(d.label, 12) }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={truncated} margin={{ top: 4, right: 8, bottom: 32, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 10, fill: '#64748b' }}
          tickLine={false}
          axisLine={false}
          angle={-35}
          textAnchor="end"
          interval={0}
        />
        <YAxis
          tick={{ fontSize: 11, fill: '#94a3b8' }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
          width={36}
        />
        <Tooltip content={(p) => <ChartTooltip {...p} dimension={dim} />} cursor={{ fill: '#f1f5f9' }} />
        <Bar dataKey="count" fill={colors.base} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function PieSegments({ data }: { data: LabelCount[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="45%"
          outerRadius="62%"
          dataKey="count"
          paddingAngle={2}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={PIE_PALETTE[i % PIE_PALETTE.length]} />
          ))}
        </Pie>
        <Tooltip formatter={(v: number) => formatCount(v)} />
        <Legend iconType="circle" iconSize={8} formatter={(v) => <span className="text-xs text-slate-600 dark:text-slate-400">{v}</span>} />
      </PieChart>
    </ResponsiveContainer>
  );
}

function LineArea({ data, dim }: { data: LabelCount[]; dim: Dimension }) {
  const colors = DIMENSION_COLORS[dim];

  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
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
          width={36}
          tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
        />
        <Tooltip content={(p) => <ChartTooltip {...p} dimension={dim} />} />
        <Line
          type="monotone"
          dataKey="count"
          stroke={colors.base}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, fill: colors.base }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

function DataTable({ data, totalArticles }: { data: LabelCount[]; totalArticles: number }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
            <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide w-8">#</th>
            <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Label</th>
            <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Count</th>
            <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">%</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => {
            const pct = totalArticles > 0 ? (row.count / totalArticles * 100) : 0;
            return (
              <tr
                key={row.label}
                className="border-b border-slate-100 dark:border-slate-800 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors"
              >
                <td className="px-3 py-2 text-xs text-slate-400">{i + 1}</td>
                <td className="px-3 py-2 text-slate-700 dark:text-slate-300 break-words">{row.label}</td>
                <td className="px-3 py-2 text-right font-medium tabular-nums">{formatCount(row.count)}</td>
                <td className="px-3 py-2 text-right text-slate-400 tabular-nums">{pct.toFixed(1)}%</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DynamicChart — главный экспортируемый компонент
// ---------------------------------------------------------------------------

interface DynamicChartProps {
  card: BuilderCard;
  onRemove: () => void;
}

export function DynamicChart({ card, onRemove }: DynamicChartProps) {
  const stats = useStatsStore((s) => s.stats);
  const isLoading = useStatsStore((s) => s.isLoading);

  const dim = card.dimension;
  const chartType = card.chartType;
  const colors = DIMENSION_COLORS[dim];

  const allData = stats ? getDataForDimension(dim, stats) : [];
  const data = sliceForType(allData, chartType);

  const title = `${colors.label} — ${CHART_TYPE_LABELS[chartType]}`;

  const removeButton = (
    <button
      onClick={onRemove}
      aria-label="Remove chart"
      className="w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors text-lg leading-none"
    >
      ×
    </button>
  );

  return (
    <ChartCard
      title={title}
      dimension={dim}
      isLoading={isLoading && !stats}
      skeletonHeight="h-64"
      headerAction={removeButton}
    >
      {stats && (
        <>
          {chartType === 'bar_h' && <HorizontalBar data={data} dim={dim} />}
          {chartType === 'bar_v' && <VerticalBar data={data} dim={dim} />}
          {chartType === 'pie'   && <PieSegments data={data} />}
          {chartType === 'line'  && <LineArea data={data} dim={dim} />}
          {chartType === 'table' && (
            <DataTable data={data} totalArticles={stats.total_articles} />
          )}
        </>
      )}
    </ChartCard>
  );
}
