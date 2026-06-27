import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Legend,
} from 'recharts';
import { useDashboardStore } from '../../stores/dashboardStore';
import { useStatsStore } from '../../stores/statsStore';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '../ui/sheet';
import { ChartTooltip } from '../charts/ChartTooltip';
import { DIMENSION_COLORS, formatCount, truncateLabel } from '../charts/chartColors';
import type { Dimension } from '../charts/chartColors';
import type { LabelCount, StatsResponse } from '../../types/api';

// ---------------------------------------------------------------------------
// Конфигурация контента drawer по измерению
// ---------------------------------------------------------------------------

interface DrawerConfig {
  title: string;
  data: LabelCount[];
  chartHeight: number;
  yAxisWidth?: number;
  labelMaxLen?: number;
  isSpecial?: 'open_access'; // особый рендер
}

function getConfig(dim: Dimension, stats: StatsResponse | null): DrawerConfig | null {
  if (!stats) return null;
  switch (dim) {
    case 'year':
      return {
        title: 'Publications by Year',
        data: [...stats.by_year].sort((a, b) => Number(a.label) - Number(b.label)),
        chartHeight: 280,
      };
    case 'country':
      return {
        title: 'Countries',
        data: [...stats.by_country].sort((a, b) => b.count - a.count),
        chartHeight: Math.max(360, stats.by_country.length * 30),
        yAxisWidth: 120,
        labelMaxLen: 22,
      };
    case 'doc_type':
      return {
        title: 'Document Types',
        data: [...stats.by_doc_type].sort((a, b) => b.count - a.count),
        chartHeight: Math.max(240, stats.by_doc_type.length * 36),
        yAxisWidth: 100,
        labelMaxLen: 18,
      };
    case 'journal':
      return {
        title: 'Top Journals',
        data: [...stats.by_journal].sort((a, b) => b.count - a.count),
        chartHeight: Math.max(480, stats.by_journal.length * 30),
        yAxisWidth: 200,
        labelMaxLen: 32,
      };
    case 'open_access':
      return {
        title: 'Open Access',
        data: [
          { label: 'Open Access', count: stats.open_access_count },
          { label: 'Closed Access', count: stats.total_articles - stats.open_access_count },
        ],
        chartHeight: 260,
        isSpecial: 'open_access',
      };
    case 'author':
      return {
        title: 'Top Authors',
        data: [...stats.top_authors].sort((a, b) => b.count - a.count),
        chartHeight: Math.max(360, stats.top_authors.length * 30),
        yAxisWidth: 140,
        labelMaxLen: 24,
      };
  }
}

// ---------------------------------------------------------------------------
// Drawer chart
// ---------------------------------------------------------------------------

const CLOSED_COLOR = '#94a3b8';

function DrawerBarChart({ dim, data, height, yAxisWidth = 120, labelMaxLen = 24 }: {
  dim: Dimension;
  data: LabelCount[];
  height: number;
  yAxisWidth?: number;
  labelMaxLen?: number;
}) {
  const colors = DIMENSION_COLORS[dim];
  const truncated = data.map((d) => ({ ...d, label: truncateLabel(d.label, labelMaxLen) }));

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
          width={yAxisWidth}
          tick={{ fontSize: 11, fill: '#64748b' }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip content={(p) => <ChartTooltip {...p} dimension={dim} />} cursor={{ fill: '#f1f5f9' }} />
        <Bar dataKey="count" radius={[0, 4, 4, 0]} fill={colors.base} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function DrawerAreaChart({ data, height }: { data: LabelCount[]; height: number }) {
  const colors = DIMENSION_COLORS.year;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
        <defs>
          <linearGradient id="drawerYearGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={colors.base} stopOpacity={0.25} />
            <stop offset="95%" stopColor={colors.base} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
        <YAxis
          tick={{ fontSize: 11, fill: '#94a3b8' }}
          tickLine={false}
          axisLine={false}
          width={40}
          tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
        />
        <Tooltip content={(p) => <ChartTooltip {...p} dimension="year" valueLabel="Publications" />} cursor={{ stroke: colors.base, strokeWidth: 1, strokeDasharray: '4 4' }} />
        <Area type="monotone" dataKey="count" stroke={colors.base} strokeWidth={2} fill="url(#drawerYearGrad)" dot={false} activeDot={{ r: 4 }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function DrawerOAChart({ data, height }: { data: LabelCount[]; height: number }) {
  const oaColor = DIMENSION_COLORS.open_access.base;
  const total = data.reduce((s, d) => s + d.count, 0);
  const oaPct = total > 0 ? ((data[0]?.count ?? 0) / total * 100).toFixed(1) : '0.0';

  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="45%"
          innerRadius="50%"
          outerRadius="72%"
          dataKey="count"
          startAngle={90}
          endAngle={-270}
          paddingAngle={2}
        >
          <Cell fill={oaColor} />
          <Cell fill={CLOSED_COLOR} />
        </Pie>
        <text x="50%" y="44%" textAnchor="middle" dominantBaseline="middle" fontSize={24} fontWeight={700} fill="#0f172a">
          {oaPct}%
        </text>
        <text x="50%" y="53%" textAnchor="middle" dominantBaseline="middle" fontSize={11} fill="#64748b">
          Open Access
        </text>
        <Tooltip content={(p) => <ChartTooltip {...p} dimension="open_access" />} />
        <Legend iconType="circle" iconSize={8} />
      </PieChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// Таблица данных
// ---------------------------------------------------------------------------

function DrawerTable({ data, totalArticles }: { data: LabelCount[]; totalArticles: number }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
            <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide w-10">#</th>
            <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Label</th>
            <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Articles</th>
            <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Share</th>
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
                <td className="px-3 py-2 text-xs text-slate-400 tabular-nums">{i + 1}</td>
                <td className="px-3 py-2 text-slate-700 dark:text-slate-300 max-w-[280px] break-words">{row.label}</td>
                <td className="px-3 py-2 text-right font-medium tabular-nums text-slate-900 dark:text-slate-100">{formatCount(row.count)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-500 dark:text-slate-400">{pct.toFixed(1)}%</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DimensionDrawer — основной компонент
// ---------------------------------------------------------------------------

export function DimensionDrawer() {
  const { drawerDimension, closeDrawer } = useDashboardStore();
  const { stats } = useStatsStore();

  const isOpen = drawerDimension !== null;
  const config = drawerDimension ? getConfig(drawerDimension, stats) : null;
  const colors = drawerDimension ? DIMENSION_COLORS[drawerDimension] : null;

  return (
    <Sheet open={isOpen} onOpenChange={(open) => { if (!open) closeDrawer(); }}>
      <SheetContent
        side="right"
        className="sm:max-w-2xl w-full flex flex-col overflow-y-auto p-0 gap-0"
      >
        {config && colors && drawerDimension && (
          <>
            <SheetHeader className="px-6 pt-6 pb-4 border-b border-slate-200 dark:border-slate-700">
              <SheetTitle className="flex items-center gap-2 text-base font-semibold">
                <span
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: colors.base }}
                />
                {config.title}
                <span className="ml-auto text-xs font-normal text-slate-400">
                  {config.data.length} {config.data.length === 1 ? 'entry' : 'entries'}
                </span>
              </SheetTitle>
            </SheetHeader>

            <div className="flex flex-col gap-6 px-6 py-6 overflow-y-auto">
              {/* Chart */}
              <div>
                {config.isSpecial === 'open_access' ? (
                  <DrawerOAChart data={config.data} height={config.chartHeight} />
                ) : drawerDimension === 'year' ? (
                  <DrawerAreaChart data={config.data} height={config.chartHeight} />
                ) : (
                  <DrawerBarChart
                    dim={drawerDimension}
                    data={config.data}
                    height={config.chartHeight}
                    yAxisWidth={config.yAxisWidth}
                    labelMaxLen={config.labelMaxLen}
                  />
                )}
              </div>

              {/* Data table */}
              <DrawerTable
                data={config.data}
                totalArticles={stats?.total_articles ?? 0}
              />
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
