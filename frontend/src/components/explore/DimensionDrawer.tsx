import { useState, useMemo } from 'react';
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
import { Slider } from '../ui/slider';
import { ChartTooltip } from '../charts/ChartTooltip';
import {
  DIMENSION_COLORS,
  AXIS_COLORS,
  formatCount,
  formatAxisTick,
  truncateLabel,
  getRankedBarColor,
  getTaxonomyColor,
  getYearRangeBounds,
  zeroFillYears,
  CLOSED_ACCESS_COLOR,
} from '../charts/chartColors';
import { getLabelMaps } from '../../constants/labelTranslations';
import { YEAR_HARD_MAX, YEAR_DEFAULT_MIN, YEAR_MIN_WINDOW } from '../../constants/yearRange';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { useTheme } from '../../hooks/useTheme';
import type { Dimension } from '../charts/chartColors';
import type { DimensionStatsSource, LabelCount, SearchStatsResponse, StatsResponse } from '../../types/api';
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
  isSpecial?: 'open_access' | 'doc_type';
}

// Ранжированные измерения (country/journal/author) — открытые списки, потенциально
// десятки/сотни значений; показываем только «голову» распределения (см.
// docs/explore-charts-refactor/spec.md §6). doc_type — закрытая таксономия, не режем.
const TOP_N_RANKED = 15;

// YEAR_HARD_MAX/YEAR_DEFAULT_MIN/YEAR_MIN_WINDOW — см. constants/yearRange.ts
// (вынесены оттуда же, используются также в TopCountriesByYearChart).

// Общий источник данных для обоих режимов (docs/explore-personal-redesign/spec.md
// §1.2) — StatsResponse (collection) адаптируется через toDimensionStatsSource()
// ниже, SearchStatsResponse (personal) структурно совместим уже как есть.
function getConfig(
  dim: Dimension,
  stats: DimensionStatsSource | null,
  t: TFunction,
  lang: string,
): DrawerConfig | null {
  if (!stats) return null;

  const maps = getLabelMaps(lang);
  const tr = (label: string, mapKey: 'country' | 'doc_type' | 'oa') =>
    maps ? (maps[mapKey][label] ?? label) : label;

  switch (dim) {
    case 'year':
      // Таблица и график (через zeroFillYears) используют один и тот же массив:
      // мусорные годы за пределами YEAR_HARD_MAX отфильтрованы здесь один раз,
      // строки отсортированы по убыванию — 2030 первой строкой (post-prod фикс
      // 2026-07-02, п.1-2).
      return {
        title: t('explore.dimensions.year'),
        data: [...stats.by_year]
          .filter((d) => Number(d.label) <= YEAR_HARD_MAX)
          .sort((a, b) => Number(b.label) - Number(a.label)),
        chartHeight: 280,
      };
    case 'country': {
      // Таблица показывает топ-15 (как раньше); вертикальный чарт берёт только
      // первые 10 из этого же массива локально в DrawerCountryChart — данные
      // не режем здесь дважды (см. spec.md §14 п.4).
      const data = [...stats.by_country]
        .sort((a, b) => b.count - a.count)
        .slice(0, TOP_N_RANKED)
        .map((d) => ({ ...d, label: tr(d.label, 'country') }));
      return {
        title: t('explore.dimensions.country'),
        data,
        // Фиксированная высота: в вертикальном layout она больше не зависит от
        // числа категорий (было — data.length * 30 для горизонтальных баров).
        chartHeight: 380,
      };
    }
    case 'doc_type':
      // Закрытая таксономия (~12 значений, сумма = 100% коллекции) — композиционные
      // данные, рендерится как donut (см. spec.md §7), а не как ранжированный список.
      return {
        title: t('explore.dimensions.doc_type'),
        data: [...stats.by_doc_type]
          .sort((a, b) => b.count - a.count)
          .map((d) => ({ ...d, label: tr(d.label, 'doc_type') })),
        chartHeight: 300,
        isSpecial: 'doc_type',
      };
    case 'journal': {
      const data = [...stats.by_journal].sort((a, b) => b.count - a.count).slice(0, TOP_N_RANKED);
      return {
        title: t('explore.dimensions.journal'),
        data,
        chartHeight: Math.max(480, data.length * 30),
        yAxisWidth: 200,
        labelMaxLen: 32,
      };
    }
    case 'open_access': {
      // by_open_access — канонически 2 элемента, лейблы 'true'/'false' (см.
      // DimensionStatsSource в types/api.ts); для collection их строит
      // toDimensionStatsSource() из open_access_count/total_articles, для
      // personal бэкенд уже отдаёт их в этом виде.
      const oa = stats.by_open_access.find((d) => d.label === 'true')?.count ?? 0;
      const closed = stats.by_open_access.find((d) => d.label === 'false')?.count ?? 0;
      return {
        title: t('explore.dimensions.open_access'),
        data: [
          { label: tr('Open Access', 'oa'), count: oa },
          { label: tr('Closed Access', 'oa'), count: closed },
        ],
        chartHeight: 260,
        isSpecial: 'open_access',
      };
    }
    case 'author': {
      // top_authors опционален — personal его не предоставляет (см. spec.md §1.1);
      // 'author' в принципе недостижим из personal UI (не входит в её список измерений).
      const data = [...(stats.top_authors ?? [])].sort((a, b) => b.count - a.count).slice(0, TOP_N_RANKED);
      return {
        title: t('explore.dimensions.author'),
        data,
        chartHeight: Math.max(360, data.length * 30),
        yAxisWidth: 140,
        labelMaxLen: 24,
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Drawer chart
// ---------------------------------------------------------------------------

function DrawerBarChart({ dim, data, height, yAxisWidth = 120, labelMaxLen = 24 }: {
  dim: Dimension;
  data: LabelCount[];
  height: number;
  yAxisWidth?: number;
  labelMaxLen?: number;
}) {
  const { i18n } = useTranslation();
  const { theme } = useTheme();
  const axis = AXIS_COLORS[theme];
  // На мобильном height ограничена (см. DimensionDrawer chartHeight — cap 280px),
  // и все TOP_N_RANKED=15 баров сжимаются в неё же — уменьшенный шрифт подписи
  // помогает читаемости при таком сжатии (post-prod фикс, п.2).
  const isMobile = useMediaQuery('(max-width: 767px)');
  const tickFontSize = isMobile ? 10 : 12;
  // color кладём прямо в данные — ChartTooltip читает его из payload[0].payload.color,
  // без этого тултип показывал бы для любого бара один и тот же dimension.base,
  // даже когда сам бар уже приглушён по рангу (см. ChartTooltip.tsx).
  const truncated = data.map((d, i) => ({
    ...d,
    label: truncateLabel(d.label, labelMaxLen),
    color: getRankedBarColor(dim, i, data.length, theme),
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={truncated} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={axis.grid} horizontal={false} />
        <XAxis
          type="number"
          tick={{ fontSize: tickFontSize, fill: axis.tickMuted }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: number) => formatAxisTick(v, i18n.language)}
        />
        <YAxis
          type="category"
          dataKey="label"
          width={yAxisWidth}
          tickLine={false}
          axisLine={false}
          // interval=0 форсирует показ ВСЕХ подписей категорий — дефолтное
          // 'preserveEnd' у Recharts тихо прячет часть подписей при нехватке
          // места (на мобильном при 15 барах в 280px оставалось только 7 из 15).
          interval={0}
          // Кастомный tick вместо {fontSize, fill}: Recharts сам переносит длинные
          // подписи на 2 строки, если те не влезают в width, а при 15 барах в 280px
          // высота строки (~18.7px) меньше высоты двух строк текста — соседние
          // подписи налезали друг на друга. Один <text> без переноса гарантирует
          // одну строку; сама обрезка по символам уже сделана truncateLabel() выше.
          tick={(props: { x: number; y: number; payload: { value: string } }) => (
            <text
              x={props.x}
              y={props.y}
              dy={4}
              textAnchor="end"
              fontSize={tickFontSize}
              fill={axis.tick}
            >
              {props.payload.value}
            </text>
          )}
        />
        <Tooltip content={(p) => <ChartTooltip {...p} dimension={dim} />} cursor={{ fill: 'rgba(148,163,184,0.1)' }} />
        <Bar dataKey="count" radius={[0, 4, 4, 0]}>
          {truncated.map((row, i) => (
            <Cell key={i} fill={row.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// Вертикальный (колоночный) чарт специально для country — единственное из
// country/journal/author измерений с достаточно короткими подписями категорий,
// чтобы читаться под углом в колоночном layout (journal/author остаются
// горизонтальными — их подписи существенно длиннее, см. spec.md §14 п.4).
const TOP_N_COUNTRY_CHART = 10;

function DrawerCountryChart({ data, height }: { data: LabelCount[]; height: number }) {
  const { i18n } = useTranslation();
  const { theme } = useTheme();
  const axis = AXIS_COLORS[theme];
  // Таблица (DrawerTable) получает полный `data` (топ-15) — здесь режем только
  // локально для графика, не трогая переданный массив.
  const chartData = data.slice(0, TOP_N_COUNTRY_CHART);
  // Ranked-затухание теперь идёт слева направо (индекс = позиция колонки), а не
  // сверху вниз — тот же getRankedBarColor, total = число КОЛОНОК на графике,
  // а не полный размер данных таблицы.
  const truncated = chartData.map((d, i) => ({
    ...d,
    label: truncateLabel(d.label, 20),
    color: getRankedBarColor('country', i, chartData.length, theme),
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      {/* margin.left=20 (не 0): угловая (-40°) подпись якорится textAnchor="end" в
          точке тика и тянется по диагонали влево-вверх — при left=0 первая буква
          самой левой подписи обрезалась краем SVG (тот же паттерн, что
          TopJournalsByCountryChart). */}
      <BarChart data={truncated} margin={{ top: 8, right: 8, bottom: 8, left: 20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={axis.grid} vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: axis.tick }}
          tickLine={false}
          axisLine={false}
          interval={0}
          angle={-40}
          textAnchor="end"
          height={80}
        />
        <YAxis
          type="number"
          tick={{ fontSize: 12, fill: axis.tickMuted }}
          tickLine={false}
          axisLine={false}
          width={40}
          tickFormatter={(v: number) => formatAxisTick(v, i18n.language)}
        />
        <Tooltip content={(p) => <ChartTooltip {...p} dimension="country" />} cursor={{ fill: 'rgba(148,163,184,0.1)' }} />
        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
          {truncated.map((row, i) => (
            <Cell key={i} fill={row.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function DrawerAreaChart({ data, height }: { data: LabelCount[]; height: number }) {
  const { i18n } = useTranslation();
  const { theme } = useTheme();
  const axis = AXIS_COLORS[theme];
  const colors = DIMENSION_COLORS.year;

  const { absoluteMin: absoluteMinYear, defaultStart } = useMemo(
    () => getYearRangeBounds(data, YEAR_DEFAULT_MIN),
    [data],
  );

  // Диапазон — локальный state: сбрасывается к дефолту при каждом открытии drawer'а
  // (компонент размонтируется при закрытии, см. spec.md §14 п.6).
  const [range, setRange] = useState<[number, number]>([defaultStart, YEAR_HARD_MAX]);

  const zeroFilled = useMemo(() => zeroFillYears(data, range[0], range[1]), [data, range]);

  return (
    <div className="flex flex-col gap-4">
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={zeroFilled} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
          <defs>
            <linearGradient id="drawerYearGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor={colors.base} stopOpacity={0.25} />
              <stop offset="95%" stopColor={colors.base} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={axis.grid} vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 12, fill: axis.tickMuted }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
          <YAxis
            tick={{ fontSize: 12, fill: axis.tickMuted }}
            tickLine={false}
            axisLine={false}
            width={40}
            tickFormatter={(v: number) => formatAxisTick(v, i18n.language)}
          />
          <Tooltip content={(p) => <ChartTooltip {...p} dimension="year" />} cursor={{ stroke: colors.base, strokeWidth: 1, strokeDasharray: '4 4' }} />
          <Area type="monotone" dataKey="count" stroke={colors.base} strokeWidth={2} fill="url(#drawerYearGrad)" dot={false} activeDot={{ r: 4 }} />
        </AreaChart>
      </ResponsiveContainer>

      {/* Range-слайдер: сжатие до YEAR_MIN_WINDOW лет, расширение до дефолта и за его
          пределы только по левому краю, вплоть до absoluteMinYear. Правый край
          неподвижен на YEAR_HARD_MAX — minStepsBetweenThumbs (не minStepsBetweenThumbs
          в пикселях, а в шагах step=1 год) обеспечивает минимальное окно. */}
      <div className="px-1">
        <div
          data-testid="year-range-labels"
          className="flex justify-between text-xs font-medium tabular-nums text-slate-700 dark:text-slate-300 mb-2"
        >
          <span>{range[0]}</span>
          <span>{range[1]}</span>
        </div>
        <div style={{ '--primary': colors.base } as React.CSSProperties}>
          <Slider
            aria-label="Диапазон лет"
            min={absoluteMinYear}
            max={YEAR_HARD_MAX}
            step={1}
            minStepsBetweenThumbs={YEAR_MIN_WINDOW}
            value={range}
            onValueChange={(v: number[]) => setRange([v[0], v[1]])}
          />
        </div>
      </div>
    </div>
  );
}

function DrawerOAChart({ data }: { data: LabelCount[] }) {
  const { theme } = useTheme();
  const oaColor = DIMENSION_COLORS.open_access.base;
  // color в данных — чтобы ChartTooltip показывал правильную точку для сегмента
  // "Closed Access" (серый CLOSED_ACCESS_COLOR), а не всегда фиксированный dimension.base
  const colored = data.map((d, i) => ({ ...d, color: i === 0 ? oaColor : CLOSED_ACCESS_COLOR }));
  const total = data.reduce((s, d) => s + d.count, 0);
  const oaPct = total > 0 ? ((data[0]?.count ?? 0) / total * 100).toFixed(1) : '0.0';
  const valueFill = theme === 'dark' ? '#f1f5f9' : '#0f172a';
  const labelFill  = theme === 'dark' ? '#94a3b8' : '#0f172a';

  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={colored}
          cx="50%"
          cy="45%"
          innerRadius="50%"
          outerRadius="72%"
          dataKey="count"
          nameKey="label"
          startAngle={90}
          endAngle={-270}
          paddingAngle={2}
          rootTabIndex={-1}
        >
          {colored.map((row, i) => (
            <Cell key={i} fill={row.color} />
          ))}
        </Pie>
        <text x="50%" y="44%" textAnchor="middle" dominantBaseline="middle" fontSize={24} fontWeight={700} fill={valueFill}>
          {oaPct}%
        </text>
        <text x="50%" y="53%" textAnchor="middle" dominantBaseline="middle" fontSize={13} fontWeight={600} fill={labelFill}>
          Open Access
        </text>
        <Tooltip content={(p) => <ChartTooltip {...p} dimension="open_access" />} />
        <Legend iconType="circle" iconSize={8} />
      </PieChart>
    </ResponsiveContainer>
  );
}

// doc_type — закрытая таксономия (~12 значений), композиционная величина
// (доли одного целого), а не бинарная как OA. Ranked-затухание одного оттенка
// здесь не подходит: смежные дуги одного круга с близкими по яркости
// вариациями одного цвета визуально сливаются в одно пятно (проверено на
// живых данных — 4 крупных сегмента разного веса читались одинаково
// фиолетовыми). Вместо этого — качественная палитра TAXONOMY_PALETTE:
// разные оттенки на каждый сегмент, единые для обеих тем (см. chartColors.ts).
// Легенда намеренно опущена: при 12 категориях многострочная легенда под
// donut'ом создаёт визуальный шум и отъедает высоту — DrawerTable ниже уже
// даёт точное сопоставление цвет/label/доля.
function DrawerDocTypeChart({ data }: { data: LabelCount[] }) {
  const { theme } = useTheme();
  // color в данных — ChartTooltip берёт его из payload[0].payload.color, иначе
  // точка в тултипе была бы одного фиксированного dimension.base для всех 12
  // сегментов, хотя сами сегменты закрашены разными цветами палитры.
  const colored = data.map((d, i) => ({ ...d, color: getTaxonomyColor(i) }));
  const total = data.reduce((s, d) => s + d.count, 0);
  const topPct = total > 0 ? ((data[0]?.count ?? 0) / total * 100).toFixed(1) : '0.0';
  const valueFill = theme === 'dark' ? '#f1f5f9' : '#0f172a';
  const labelFill  = theme === 'dark' ? '#94a3b8' : '#0f172a';

  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={colored}
          cx="50%"
          cy="50%"
          innerRadius="48%"
          outerRadius="75%"
          dataKey="count"
          nameKey="label"
          startAngle={90}
          endAngle={-270}
          // Малый paddingAngle: доля многих категорий (~0.1-0.3%) даёт угол среза
          // <1° — при paddingAngle=1.5 (как в OA-версии, где сегментов всего 2) зазор
          // между соседними срезами становится больше самого среза и выглядит как
          // светлая линия поверх заливки. 0.4 держит границы читаемыми и для 12
          // сегментов, не «съедая» самые тонкие из них.
          paddingAngle={0.4}
          rootTabIndex={-1}
        >
          {colored.map((row, i) => (
            <Cell key={i} fill={row.color} />
          ))}
        </Pie>
        <text x="50%" y="47%" textAnchor="middle" dominantBaseline="middle" fontSize={22} fontWeight={700} fill={valueFill}>
          {topPct}%
        </text>
        <text x="50%" y="57%" textAnchor="middle" dominantBaseline="middle" fontSize={13} fontWeight={600} fill={labelFill}>
          {truncateLabel(data[0]?.label ?? '', 20)}
        </text>
        <Tooltip content={(p) => <ChartTooltip {...p} dimension="doc_type" />} />
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
// Адаптер collection → общий источник (personal уже структурно совместим —
// SearchStatsResponse satisfies DimensionStatsSource без преобразований)
// ---------------------------------------------------------------------------

function toDimensionStatsSource(stats: StatsResponse | null): DimensionStatsSource | null {
  if (!stats) return null;
  return {
    total: stats.total_articles,
    by_year: stats.by_year,
    by_country: stats.by_country,
    by_doc_type: stats.by_doc_type,
    by_journal: stats.by_journal,
    by_open_access: [
      { label: 'true', count: stats.open_access_count },
      { label: 'false', count: stats.total_articles - stats.open_access_count },
    ],
    top_authors: stats.top_authors,
  };
}

// ---------------------------------------------------------------------------
// DimensionDrawerCore — общая презентационная сердцевина (без обращения к
// какому-либо стору), используется обеими обёртками ниже
// ---------------------------------------------------------------------------

function DimensionDrawerCore({ source }: { source: DimensionStatsSource | null }) {
  const { t, i18n } = useTranslation();
  const { drawerDimension, closeDrawer } = useDashboardStore();
  const isMobile = useMediaQuery('(max-width: 767px)');

  const isOpen = drawerDimension !== null;
  const config = drawerDimension ? getConfig(drawerDimension, source, t, i18n.language) : null;
  const colors = drawerDimension ? DIMENSION_COLORS[drawerDimension] : null;
  // Donut-графики (open_access/doc_type) занимают фиксированную долю высоты вкладки
  // (60% график+подписи / 40% таблица, post-prod фикс 2026-07-02 п.3) вместо
  // content-based высоты в пикселях — см. блок рендера ниже.
  const isDonut = config?.isSpecial === 'open_access' || config?.isSpecial === 'doc_type';

  // На мобильных chart height ограничен чтобы не выходить за 85dvh (не используется
  // для donut-графиков — там высота задаётся flex-basis, а не пикселями).
  const chartHeight = config
    ? (isMobile ? Math.min(config.chartHeight, 280) : config.chartHeight)
    : 0;

  return (
    <Sheet open={isOpen} onOpenChange={(open) => { if (!open) closeDrawer(); }}>
      <SheetContent
        side={isMobile ? 'bottom' : 'right'}
        className={
          isMobile
            // 85dvh «в притык» задевал заголовок страницы на невысоких мобильных
            // viewport'ах (напр. 810px высотой — зазор между низом заголовка и
            // верхом drawer'а был 0.6px). min(85dvh, 100dvh-140px) гарантирует
            // от шапки минимум 140px, не срезая высоту drawer'а на высоких экранах.
            ? 'h-[min(85dvh,calc(100dvh_-_140px))] w-full flex flex-col p-0 gap-0 rounded-t-xl overflow-hidden'
            : 'sm:max-w-2xl lg:max-w-3xl w-full h-full flex flex-col overflow-hidden p-0 gap-0'
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

            {/* Donut-графики (open_access/doc_type): фиксированное соотношение
                60% график+подписи / 40% таблица (basis-3/5 / basis-2/5 — оба со
                shrink по умолчанию и min-h-0, чтобы таблица скроллилась, если её
                контент всё же не влезает в отведённые 40%). Остальные измерения —
                прежнее поведение: chart закреплён по контенту (flex-shrink-0),
                таблица получает весь остаток высоты (flex-1). min-h-0 обязателен
                на растягивающихся блоках — иначе flex-item не сжимается меньше
                своего контента и overflow-y-auto ничего не скроллит (см.
                docs/explore-charts-refactor/spec.md §4, §14 п.3). */}
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
              {isDonut ? (
                <>
                  <div className="basis-3/5 min-h-0 overflow-hidden px-6 pt-6">
                    {config.isSpecial === 'open_access' ? (
                      <DrawerOAChart data={config.data} />
                    ) : (
                      <DrawerDocTypeChart data={config.data} />
                    )}
                  </div>

                  <div className="basis-2/5 min-h-0 overflow-y-auto px-6 pb-6 pt-6">
                    <DrawerTable
                      data={config.data}
                      totalArticles={source?.total ?? 0}
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="flex-shrink-0 px-6 pt-6">
                    {drawerDimension === 'year' ? (
                      <DrawerAreaChart data={config.data} height={chartHeight} />
                    ) : drawerDimension === 'country' ? (
                      <DrawerCountryChart data={config.data} height={chartHeight} />
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

                  <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-6 pt-6">
                    <DrawerTable
                      data={config.data}
                      totalArticles={source?.total ?? 0}
                    />
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// DimensionDrawer — collection mode (поведение не меняется относительно
// исходной версии, снаружи по-прежнему без пропсов)
// ---------------------------------------------------------------------------

export function DimensionDrawer() {
  const { stats } = useStatsStore();
  return <DimensionDrawerCore source={toDimensionStatsSource(stats)} />;
}

// ---------------------------------------------------------------------------
// PersonalDimensionDrawer — personal mode (docs/explore-personal-redesign/spec.md
// §1.2 п.3). SearchStatsResponse структурно satisfies DimensionStatsSource —
// передаётся как есть, без адаптера.
// ---------------------------------------------------------------------------

export function PersonalDimensionDrawer({ stats }: { stats: SearchStatsResponse | null }) {
  return <DimensionDrawerCore source={stats} />;
}
