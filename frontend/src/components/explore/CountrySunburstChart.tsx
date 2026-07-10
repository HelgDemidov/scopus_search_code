import { useMemo, useState } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import type { TooltipProps } from 'recharts';
import type { ValueType, NameType } from 'recharts/types/component/DefaultTooltipContent';
import { useTranslation } from 'react-i18next';
import { useStatsStore } from '../../stores/statsStore';
import { useTheme } from '../../hooks/useTheme';
import { ChartCard } from '../charts/ChartCard';
import { applyMinimumArcFloor, formatCount } from '../charts/chartColors';
import { getCountryColor, getCountryColorVariant } from '../../constants/countryColors';
import { getLabelMaps } from '../../constants/labelTranslations';
import { buildRawGroups } from './crossChartData';

// График 2 — Sunburst Country → OpenAccess (docs/explore-cross-analytics/spec.md §5).
// Изначально был 3-уровневым (+ DocType посередине), упрощён до 2 уровней по итогам
// визуального ревью — третий слой был визуально нечитаем, а разное число сегментов
// между 3 кольцами (в сочетании с разным paddingAngle на каждом) ломало выравнивание
// границ между уровнями. Recharts не имеет встроенного sunburst-типа — используется
// стандартный приём: вложенные Pie на разных радиусах в одном PieChart, авто-
// распределяющие углы пропорционально `value` в пределах 360°. Для точного
// выравнивания дочернего кольца под родительским нужно РОВНО одинаковое паддинг-
// поведение на обоих кольцах — здесь paddingAngle=0 везде, визуальное разделение
// сегментов даёт только тонкий stroke (см. renderCells), не paddingAngle.

interface ChildInfo {
  label: string;
  value: string; // уже отформатированное число — для тултипа родителя
  color: string;
}

interface RingDatum {
  key: string;
  country: string; // для определения "дочерний ли сегмент level2 от выбранной страны level1"
  value: number;
  renderValue: number;
  parentTotal: number;
  parentLabel: string;
  levelLabel: string;
  displayLabel: string;
  color: string;
  children?: ChildInfo[]; // только у level1 — см. spec.md §2.4 (тултип показывает и дочерние сегменты)
}

function useSunburstRings(): { level1: RingDatum[]; level2: RingDatum[] } {
  const stats = useStatsStore((s) => s.stats);
  const { t, i18n } = useTranslation();
  const { theme } = useTheme();
  const data = useMemo(() => stats?.sunburst_country_open_access ?? [], [stats]);

  const grouped = useMemo(() => buildRawGroups(data), [data]);

  const maps = getLabelMaps(i18n.language);
  const trCountry = (l: string) => (maps ? maps.country[l] ?? l : l);
  const trOA = (isOpen: boolean) => {
    const raw = isOpen ? 'Open Access' : 'Closed Access';
    return maps ? maps.oa[raw] ?? raw : raw;
  };

  const allPublicationsLabel = t('explore.crossCharts.allPublications');
  const levelCountryLabel = t('explore.crossCharts.sunburstLevelCountry');
  const levelOALabel = t('explore.crossCharts.sunburstLevelOpenAccess');

  // level2: цвет наследуется от родительской страны (spec.md §2.4) — крупнейший
  // OA-сегмент страны получает ровно getCountryColor(), второй — оттенок того же hue.
  const level2WithFloor = applyMinimumArcFloor(grouped.level2Raw.map((d) => ({ ...d })), 1.5);

  // Группируем по стране, чтобы определить major/minor внутри каждой пары.
  const level2ByCountry = new Map<string, typeof level2WithFloor>();
  for (const d of level2WithFloor) {
    const arr = level2ByCountry.get(d.country) ?? [];
    arr.push(d);
    level2ByCountry.set(d.country, arr);
  }

  const level2Final: RingDatum[] = [];
  const childrenByCountry = new Map<string, ChildInfo[]>();
  for (const country of grouped.level1Raw.map((l) => l.country)) {
    const segs = level2ByCountry.get(country) ?? [];
    const sorted = [...segs].sort((a, b) => b.value - a.value);
    const children: ChildInfo[] = [];
    sorted.forEach((seg, i) => {
      const color = getCountryColorVariant(country, theme, i === 0 ? 'major' : 'minor');
      level2Final.push({
        key: `${seg.country}|${seg.openAccess}`,
        country: seg.country,
        value: seg.value,
        renderValue: seg.renderValue,
        parentTotal: grouped.level1Raw.find((l) => l.country === country)?.value ?? 0,
        parentLabel: trCountry(country),
        levelLabel: levelOALabel,
        displayLabel: trOA(seg.openAccess),
        color,
      });
      children.push({ label: trOA(seg.openAccess), value: formatCount(seg.value), color });
    });
    childrenByCountry.set(country, children);
  }

  const level1WithFloor = applyMinimumArcFloor(
    grouped.level1Raw.map((d) => ({ ...d })),
    0, // страны — крупные доли, флурить не нужно; 0 делает вызов no-op (единообразие shape)
  );
  const level1: RingDatum[] = level1WithFloor.map((d) => ({
    key: d.country,
    country: d.country,
    value: d.value,
    renderValue: d.renderValue,
    parentTotal: grouped.grandTotal,
    parentLabel: allPublicationsLabel,
    levelLabel: levelCountryLabel,
    displayLabel: trCountry(d.country),
    color: getCountryColor(d.country, theme),
    children: childrenByCountry.get(d.country) ?? [],
  }));

  return { level1, level2: level2Final };
}

function SunburstTooltip({ active, payload }: TooltipProps<ValueType, NameType>) {
  const { t } = useTranslation();
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload as RingDatum | undefined;
  if (!d) return null;
  const pct = d.parentTotal > 0 ? ((d.value / d.parentTotal) * 100).toFixed(1) : '0.0';

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#152236] px-3 py-2 shadow-lg text-sm max-w-[240px]">
      <p className="font-medium text-slate-900 dark:text-slate-100 mb-1 break-words">
        {d.levelLabel}: {d.displayLabel}
      </p>
      <div className="flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
        <span className="font-semibold text-slate-900 dark:text-slate-100">{formatCount(d.value)}</span>
        <span className="text-slate-500 dark:text-slate-400">
          ({pct}% {t('explore.crossCharts.ofParent', { parent: d.parentLabel })})
        </span>
      </div>
      {/* Дочерние сегменты (только у level1 — country): наведение на страну также
          показывает разбивку по Open/Closed Access, не только итог по стране
          (spec.md §2.4) */}
      {d.children && d.children.length > 0 && (
        <div className="mt-1.5 pt-1.5 border-t border-slate-100 dark:border-slate-800 flex flex-col gap-1">
          {d.children.map((c) => (
            <div key={c.label} className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: c.color }} />
              <span className="text-slate-500 dark:text-slate-400 flex-1">{c.label}</span>
              <span className="font-medium tabular-nums text-slate-900 dark:text-slate-100">{c.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

type RingId = 1 | 2;

// Радиусные полосы 2 колец — минимальный зазор между ними (тонкая граница, не
// широкий "воздух") — частично заимствован стиль референса пользователя (Disk Usage
// Analyzer): контрастные насыщенные цвета, острые сектора, тонкие разделители.
const RINGS: Record<RingId, { inner: string; outer: string }> = {
  1: { inner: '28%', outer: '58%' },
  2: { inner: '60%', outer: '90%' },
};

// Толщина обводки между сегментами — тонкая (не "воздух" paddingAngle, см. выше).
// Обводка не меняется при hover/click — единственная реакция на клик теперь
// изменение заливки (см. brightenHsl), рамки при наведении курсора больше нет.
const STROKE_WIDTH = 1;

const BRIGHTEN_DELTA_PERCENT = 10;

// Осветляет hsl(...)-строку на фиксированное число процентных пунктов светлоты —
// используется для клика по сегменту sunburst (сам сегмент + все его дочерние
// становятся на 10% ярче, см. docs/explore-cross-analytics/spec.md).
function brightenHsl(hsl: string, deltaPercent: number): string {
  const match = hsl.match(/^hsl\(([\d.]+),\s*(\d+)%,\s*(\d+)%\)$/);
  if (!match) return hsl;
  const [, h, s, l] = match;
  const newL = Math.min(95, Number(l) + deltaPercent);
  return `hsl(${h}, ${s}%, ${newL}%)`;
}

export function CountrySunburstChart() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const stats = useStatsStore((s) => s.stats);
  const { level1, level2 } = useSunburstRings();
  const isLoading = stats === null;

  // Тонкая обводка между сегментами — совпадает с фоном карточки своей темы (не
  // меняется при hover/click, см. STROKE_WIDTH выше).
  const separatorColor = theme === 'dark' ? '#152236' : '#ffffff';

  // rootTabIndex={-1} на обоих <Pie> ниже: по умолчанию Recharts делает всю группу
  // сектора фокусируемой (rootTabIndex=0) — клик по сегменту переводит на неё фокус,
  // и браузер рисует нативную прямоугольную focus-рамку поверх круга. Она не связана
  // с логикой подсветки (isBrightened/brightenHsl) и не нужна — а11y-навигация по
  // секторам стрелками этим графиком не используется.

  // Выбранный (клик) сегмент — при клике сам сегмент и все его дочерние (для
  // level1 — оба OA-сегмента этой страны в level2) становятся на 10% ярче.
  // Повторный клик по тому же сегменту снимает выбор.
  const [selected, setSelected] = useState<{ ring: RingId; key: string; country: string } | null>(null);

  function isBrightened(d: RingDatum, ring: RingId): boolean {
    if (!selected) return false;
    if (selected.ring === ring && selected.key === d.key) return true; // сам сегмент
    if (ring === 2 && selected.ring === 1 && selected.country === d.country) return true; // дочерний для level1
    return false;
  }

  function ringClickHandler(ring: RingId, data: RingDatum[]) {
    return {
      onClick: (_: unknown, index: number) => {
        const d = data[index];
        if (!d) return;
        setSelected((prev) =>
          prev?.ring === ring && prev.key === d.key ? null : { ring, key: d.key, country: d.country },
        );
      },
    };
  }

  function renderCells(ring: RingId, data: RingDatum[]) {
    return data.map((d) => (
      <Cell
        key={d.key}
        fill={isBrightened(d, ring) ? brightenHsl(d.color, BRIGHTEN_DELTA_PERCENT) : d.color}
        stroke={separatorColor}
        strokeWidth={STROKE_WIDTH}
        style={{ cursor: 'pointer' }}
      />
    ));
  }

  return (
    <ChartCard title={t('explore.crossCharts.sunburst')} isLoading={isLoading} skeletonHeight="h-96" translucent>
      <ResponsiveContainer width="100%" height={420}>
        <PieChart>
          <Pie
            data={level1}
            dataKey="renderValue"
            nameKey="displayLabel"
            cx="50%"
            cy="50%"
            innerRadius={RINGS[1].inner}
            outerRadius={RINGS[1].outer}
            startAngle={90}
            endAngle={-270}
            paddingAngle={0}
            isAnimationActive={false}
            rootTabIndex={-1}
            {...ringClickHandler(1, level1)}
          >
            {renderCells(1, level1)}
          </Pie>
          <Pie
            data={level2}
            dataKey="renderValue"
            nameKey="displayLabel"
            cx="50%"
            cy="50%"
            innerRadius={RINGS[2].inner}
            outerRadius={RINGS[2].outer}
            startAngle={90}
            endAngle={-270}
            paddingAngle={0}
            isAnimationActive={false}
            rootTabIndex={-1}
            {...ringClickHandler(2, level2)}
          >
            {renderCells(2, level2)}
          </Pie>
          <Tooltip content={(p) => <SunburstTooltip {...p} />} />
        </PieChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
