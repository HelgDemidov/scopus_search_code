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
import { useTranslation } from 'react-i18next';
import { useDashboardStore } from '../../stores/dashboardStore';
import { useStatsStore } from '../../stores/statsStore';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '../ui/sheet';
import { ChartTooltip } from '../charts/ChartTooltip';
import { DIMENSION_COLORS, formatCount, formatAxisTick, truncateLabel } from '../charts/chartColors';
import {
  COUNTRY_TRANSLATIONS_RU,
  DOC_TYPE_TRANSLATIONS_RU,
  OA_LABELS_RU,
  translateDataLabel,
} from '../../constants/labelTranslations';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { useTheme } from '../../hooks/useTheme';
import type { Dimension } from '../charts/chartColors';
import type { LabelCount, StatsResponse } from '../../types/api';
import type { TFunction } from 'i18next';

// ---------------------------------------------------------------------------
// Конфигурация контента drawer по измерению
// ---------------------------------------------------------------------------

interface DrawerConfig {
  title: string;
  data: LabelCount[];
  chartHeight: number;
  yAxisWidth?: number;
  labelMaxLen?: number;
  isSpecial?: 'open_access';
}

function getConfig(
  dim: Dimension,
  stats: StatsResponse | null,
  t: TFunction,
  lang: string,
): DrawerConfig | null {
  if (!stats) return null;

  const tr = (label: string, map: Record<string, string>) =>
    translateDataLabel(label, lang, map);

  switch (dim) {
    case 'year':
      return {
        title: t('explore.dimensions.year'),
        data: [...stats.by_year].sort((a, b) => Number(a.label) - Number(b.label)),
        chartHeight: 280,
      };
    case 'country':
      return {
        title: t('explore.dimensions.country'),
        data: [...stats.by_country]
          .sort((a, b) => b.count - a.count)
          .map((d) => ({ ...d, label: tr(d.label, COUNTRY_TRANSLATIONS_RU) })),
        chartHeight: Math.max(360, stats.by_country.length * 30),
        yAxisWidth: lang === 'ru' ? 140 : 120,
        labelMaxLen: lang === 'ru' ? 22 : 22,
      };
    case 'doc_type':
      return {
        title: t('explore.dimensions.doc_type'),
        data: [...stats.by_doc_type]
          .sort((a, b) => b.count - a.count)
          .map((d) => ({ ...d, label: tr(d.label, DOC_TYPE_TRANSLATIONS_RU) })),
        chartHeight: Math.max(240, stats.by_doc_type.length * 36),
        yAxisWidth: 120,
        labelMaxLen: 20,
      };
    case 'journal':
      return {
        title: t('explore.dimensions.journal'),
        data: [...stats.by_journal].sort((a, b) => b.count - a.count),
        chartHeight: Math.max(480, stats.by_journal.length * 30),
        yAxisWidth: 200,
        labelMaxLen: 32,
      };
    case 'open_access':
      return {
        title: t('explore.dimensions.open_access'),
        data: [
          { label: tr('Open Access', OA_LABELS_RU), count: stats.open_access_count },
          { label: tr('Closed Access', OA_LABELS_RU), count: stats.total_articles - stats.open_access_count },
        ],
        chartHeight: 260,
        isSpecial: 'open_access',
      };
    case 'author':
      return {
        title: t('explore.dimensions.author'),
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
  const { i18n } = useTranslation();
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
          tickFormatter={(v: number) => formatAxisTick(v, i18n.language)}
        />
        <YAxis
          type="category"
          dataKey="label"
          width={yAxisWidth}
          tick={{ fontSize: 11, fill: '#64748b' }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip content={(p) => <ChartTooltip {...p} dimension={dim} />} cursor={{ fill: 'rgba(148,163,184,0.1)' }} />
        <Bar dataKey="count" radius={[0, 4, 4, 0]} fill={colors.base} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function DrawerAreaChart({ data, height }: { data: LabelCount[]; height: number }) {
  const { i18n } = useTranslation();
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
          tickFormatter={(v: number) => formatAxisTick(v, i18n.language)}
        />
        <Tooltip content={(p) => <ChartTooltip {...p} dimension="year" />} cursor={{ stroke: colors.base, strokeWidth: 1, strokeDasharray: '4 4' }} />
        <Area type="monotone" dataKey="count" stroke={colors.base} strokeWidth={2} fill="url(#drawerYearGrad)" dot={false} activeDot={{ r: 4 }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function DrawerOAChart({ data, height }: { data: LabelCount[]; height: number }) {
  const { theme } = useTheme();
  const oaColor = DIMENSION_COLORS.open_access.base;
  const total = data.reduce((s, d) => s + d.count, 0);
  const oaPct = total > 0 ? ((data[0]?.count ?? 0) / total * 100).toFixed(1) : '0.0';
  const valueFill = theme === 'dark' ? '#f1f5f9' : '#0f172a';
  const labelFill  = theme === 'dark' ? '#94a3b8' : '#64748b';

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
          nameKey="label"
          startAngle={90}
          endAngle={-270}
          paddingAngle={2}
        >
          <Cell fill={oaColor} />
          <Cell fill={CLOSED_COLOR} />
        </Pie>
        <text x="50%" y="44%" textAnchor="middle" dominantBaseline="middle" fontSize={24} fontWeight={700} fill={valueFill}>
          {oaPct}%
        </text>
        <text x="50%" y="53%" textAnchor="middle" dominantBaseline="middle" fontSize={11} fill={labelFill}>
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
  const { t } = useTranslation();
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
            <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide w-10">#</th>
            <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('explore.tableColLabel')}</th>
            <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('explore.tableColArticles')}</th>
            <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('explore.tableColShare')}</th>
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
  const { t, i18n } = useTranslation();
  const { drawerDimension, closeDrawer } = useDashboardStore();
  const { stats } = useStatsStore();
  const isMobile = useMediaQuery('(max-width: 767px)');

  const isOpen = drawerDimension !== null;
  const config = drawerDimension ? getConfig(drawerDimension, stats, t, i18n.language) : null;
  const colors = drawerDimension ? DIMENSION_COLORS[drawerDimension] : null;

  // На мобильных chart height ограничен чтобы не выходить за 85dvh
  const chartHeight = config
    ? (isMobile ? Math.min(config.chartHeight, 280) : config.chartHeight)
    : 0;

  return (
    <Sheet open={isOpen} onOpenChange={(open) => { if (!open) closeDrawer(); }}>
      <SheetContent
        side={isMobile ? 'bottom' : 'right'}
        className={
          isMobile
            ? 'h-[85dvh] w-full flex flex-col p-0 gap-0 rounded-t-xl overflow-hidden'
            : 'sm:max-w-2xl w-full flex flex-col overflow-y-auto p-0 gap-0'
        }
      >
        {config && colors && drawerDimension && (
          <>
            {/* Drag handle — только на мобильных */}
            {isMobile && (
              <div className="flex-shrink-0 flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-600" />
              </div>
            )}

            <SheetHeader className="px-6 pt-4 pb-4 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
              <SheetTitle className="flex items-center gap-2 text-base font-semibold">
                <span
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: colors.base }}
                />
                {config.title}
              </SheetTitle>
            </SheetHeader>

            <div className="flex flex-col gap-6 px-6 py-6 overflow-y-auto flex-1">
              {/* Chart */}
              <div>
                {config.isSpecial === 'open_access' ? (
                  <DrawerOAChart data={config.data} height={chartHeight} />
                ) : drawerDimension === 'year' ? (
                  <DrawerAreaChart data={config.data} height={chartHeight} />
                ) : (
                  <DrawerBarChart
                    dim={drawerDimension}
                    data={config.data}
                    height={chartHeight}
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
