import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, X } from 'lucide-react';
import { useDashboardStore } from '../../stores/dashboardStore';
import { useStatsStore } from '../../stores/statsStore';
import { getPivot } from '../../api/stats';
import { ChartCard } from '../charts/ChartCard';
import { Button } from '../ui/button';
import { PivotTable } from './PivotTable';
import { ALL_PIVOT_DIMENSIONS, getSlicerOptions } from './tableBuilderData';
import type { BuilderCard } from '../../stores/dashboardStore';
import type { PivotDimension, PivotResponse } from '../../types/api';

// Table Builder (docs/explore-table-builder/spec.md §3) — заменяет флоский
// ChartBuilderPanel. Пары измерений не нужно валидировать против whitelist на
// клиенте: 5 базовых измерений дают ровно C(5,2)=10 пар — столько же, сколько
// в _ALLOWED_PIVOT_PAIRS на бэкенде (app/routers/articles.py). Форма просто
// исключает уже выбранное измерение из списка вариантов для другой оси —
// этого достаточно, чтобы делать только валидные комбинации.

const TOP_N_ROWS = 20;
const TOP_N_COLS = 15;

function usePivotData(rowDim: PivotDimension, colDim: PivotDimension, filterDim?: PivotDimension, filterValue?: string) {
  const [data, setData] = useState<PivotResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsLoading(true);
    getPivot(
      { rowDim, colDim, topNRows: TOP_N_ROWS, topNCols: TOP_N_COLS, filterDim, filterValue },
      controller.signal,
    )
      .then((res) => {
        if (!controller.signal.aborted) setData(res);
      })
      .catch(() => {
        // AbortError при размонтировании карточки — ожидаемо, не ошибка
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });
    return () => controller.abort();
  }, [rowDim, colDim, filterDim, filterValue]);

  return { data, isLoading };
}

// ---------------------------------------------------------------------------
// Карточка одной пользовательской таблицы
// ---------------------------------------------------------------------------

function PivotTableCard({ card, onRemove }: { card: BuilderCard; onRemove: () => void }) {
  const { t } = useTranslation();
  const { data, isLoading } = usePivotData(card.rowDim, card.colDim, card.filterDim, card.filterValue);
  const title = t('explore.tableBuilder.pairTitle', {
    row: t(`explore.dimensionLabels.${card.rowDim}`),
    col: t(`explore.dimensionLabels.${card.colDim}`),
  });

  return (
    <ChartCard
      title={title}
      isLoading={isLoading && !data}
      skeletonHeight="h-64"
      headerAction={
        <button
          onClick={onRemove}
          aria-label={t('explore.tableBuilder.removeTable')}
          className="rounded-md p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors"
        >
          <X className="size-4" aria-hidden />
        </button>
      }
    >
      {data && <PivotTable data={data} rowDim={card.rowDim} colDim={card.colDim} />}
    </ChartCard>
  );
}

// ---------------------------------------------------------------------------
// Форма добавления новой таблицы
// ---------------------------------------------------------------------------

const selectClass =
  'rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent dark:bg-slate-800 px-2.5 py-1.5 text-sm text-slate-700 dark:text-slate-300';

function AddTableForm({
  onAdd,
  onCancel,
}: {
  onAdd: (card: Omit<BuilderCard, 'id'>) => void;
  onCancel: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { stats } = useStatsStore();
  const [rowDim, setRowDim] = useState<PivotDimension>('year');
  const [colDim, setColDim] = useState<PivotDimension>('country');
  const [filterDim, setFilterDim] = useState<PivotDimension | ''>('');
  const [filterValue, setFilterValue] = useState('');

  const colOptions = ALL_PIVOT_DIMENSIONS.filter((d) => d !== rowDim);
  const filterOptions = ALL_PIVOT_DIMENSIONS.filter((d) => d !== rowDim && d !== colDim);
  const slicerValueOptions = filterDim ? getSlicerOptions(filterDim, stats, i18n.language) : [];

  function resetFilterIfStale(nextRowDim: PivotDimension, nextColDim: PivotDimension) {
    if (filterDim && (filterDim === nextRowDim || filterDim === nextColDim)) {
      setFilterDim('');
      setFilterValue('');
    }
  }

  function handleRowDimChange(next: PivotDimension) {
    setRowDim(next);
    // rowDim и colDim не могут совпадать — подставляем первое доступное измерение
    const nextCol = next === colDim ? (ALL_PIVOT_DIMENSIONS.find((d) => d !== next) as PivotDimension) : colDim;
    if (nextCol !== colDim) setColDim(nextCol);
    resetFilterIfStale(next, nextCol);
  }

  function handleColDimChange(next: PivotDimension) {
    setColDim(next);
    resetFilterIfStale(rowDim, next);
  }

  function handleAdd() {
    onAdd({
      rowDim,
      colDim,
      filterDim: filterDim || undefined,
      filterValue: filterDim ? filterValue || undefined : undefined,
    });
  }

  const canAdd = rowDim !== colDim && (!filterDim || filterValue !== '');

  return (
    <div
      role="region"
      aria-label={t('explore.tableBuilder.heading')}
      className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#152236] p-5 flex flex-col gap-4 shadow-sm"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            {t('explore.tableBuilder.rowsLabel')}
          </span>
          <select
            value={rowDim}
            onChange={(e) => handleRowDimChange(e.target.value as PivotDimension)}
            className={selectClass}
          >
            {ALL_PIVOT_DIMENSIONS.map((d) => (
              <option key={d} value={d}>
                {t(`explore.dimensionLabels.${d}`)}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            {t('explore.tableBuilder.colsLabel')}
          </span>
          <select
            value={colDim}
            onChange={(e) => handleColDimChange(e.target.value as PivotDimension)}
            className={selectClass}
          >
            {colOptions.map((d) => (
              <option key={d} value={d}>
                {t(`explore.dimensionLabels.${d}`)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            {t('explore.tableBuilder.slicerLabel')}
          </span>
          <select
            value={filterDim}
            onChange={(e) => {
              setFilterDim(e.target.value as PivotDimension | '');
              setFilterValue('');
            }}
            className={selectClass}
          >
            <option value="">{t('explore.tableBuilder.slicerNone')}</option>
            {filterOptions.map((d) => (
              <option key={d} value={d}>
                {t(`explore.dimensionLabels.${d}`)}
              </option>
            ))}
          </select>
        </label>

        {filterDim && (
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              {t('explore.tableBuilder.slicerValueLabel')}
            </span>
            <select value={filterValue} onChange={(e) => setFilterValue(e.target.value)} className={selectClass}>
              <option value="" disabled>
                {t('explore.tableBuilder.slicerValueLabel')}
              </option>
              {slicerValueOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="flex items-center gap-3 pt-1">
        {/* Тот же синий + text-white/rounded-md, что и Sign in (Header.tsx, CTA-баннер
            ExplorePage.tsx) — единый вид основных CTA-кнопок сайта в обеих темах,
            а не дефолтные shadcn Button text-primary-foreground/rounded-lg.
            size="default" (h-8, text-sm) вместо "sm" (h-7, text-[0.8rem]) — совпадает
            по размеру шрифта и уровню с соседней текстовой кнопкой Cancel. */}
        <Button
          onClick={handleAdd}
          disabled={!canAdd}
          size="default"
          className="bg-blue-800 hover:bg-blue-900 dark:bg-blue-500 dark:hover:bg-blue-400 text-white rounded-md"
        >
          {t('explore.tableBuilder.addButton')}
        </Button>
        <button
          onClick={onCancel}
          className="text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
        >
          {t('explore.tableBuilder.cancel')}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TableBuilderPanel
// ---------------------------------------------------------------------------

export function TableBuilderPanel() {
  const { t } = useTranslation();
  const builderCards = useDashboardStore((s) => s.builderCards);
  const addBuilderCard = useDashboardStore((s) => s.addBuilderCard);
  const removeBuilderCard = useDashboardStore((s) => s.removeBuilderCard);
  const [isOpen, setIsOpen] = useState(false);

  function handleAdd(card: Omit<BuilderCard, 'id'>) {
    addBuilderCard(card);
    setIsOpen(false);
  }

  // Пока нет ни одной таблицы и форма свёрнута, отдельный заголовок избыточен —
  // текст "Table Builder" переезжает внутрь самой кнопки-триггера (см. п.4 фикса
  // 2026-07-03). Заголовок возвращается, как только появляется хотя бы одна
  // карточка или открыта форма добавления — там он даёт визуальную подпись секции.
  const showHeading = isOpen || builderCards.length > 0;

  return (
    <div className="flex flex-col gap-6">
      {showHeading && (
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          {t('explore.tableBuilder.heading')}
        </h2>
      )}

      {builderCards.length > 0 && (
        <div className="flex flex-col gap-6">
          {builderCards.map((card) => (
            <PivotTableCard key={card.id} card={card} onRemove={() => removeBuilderCard(card.id)} />
          ))}
        </div>
      )}

      {isOpen ? (
        <AddTableForm onAdd={handleAdd} onCancel={() => setIsOpen(false)} />
      ) : (
        <button
          onClick={() => setIsOpen(true)}
          aria-label={t('explore.tableBuilder.addButton')}
          // Заливка/рамка — по образцу KpiTile (KpiTile.tsx): цветной фон при
          // низкой непрозрачности + нейтральная slate-рамка, но здесь 20% вместо
          // 10% ("прозрачность 80%" вместо "90%"), т.к. кнопка на всю ширину и
          // менее плотная по контенту, чем KPI-тайл. Фиолетовый (violet) — тот же
          // акцент, что у KPI-тайла Document Types (doc_type в DIMENSION_COLORS,
          // chartColors.ts) — выбран по прямому запросу пользователя 2026-07-03,
          // без привязки к какому-то одному измерению по смыслу.
          // Текст — text-lg/font-semibold/slate-900|100, 1:1 как у заголовка
          // "Table Builder" в открытом состоянии (тот же h2 ниже) — тот же
          // размер и цвет в обеих темах. justify-start (не center) — текст
          // прижат к левому краю с тем же px-5, что и у карточек рядом.
          className="flex items-center justify-start gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-violet-800/20 dark:bg-violet-500/20 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-violet-800/25 dark:hover:bg-violet-500/25 hover:shadow-sm px-5 py-3 text-lg font-semibold text-slate-900 dark:text-slate-100 transition-all w-full"
        >
          <Plus className="size-4" aria-hidden />
          {builderCards.length > 0 ? t('explore.tableBuilder.addButton') : t('explore.tableBuilder.heading')}
        </button>
      )}
    </div>
  );
}
