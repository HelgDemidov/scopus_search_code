import { useState } from 'react';
import { useDashboardStore } from '../../stores/dashboardStore';
import { DIMENSION_COLORS, CHART_TYPE_LABELS } from '../charts/chartColors';
import type { Dimension, ChartType } from '../charts/chartColors';

// ---------------------------------------------------------------------------
// Матрица допустимых chart-типов по измерению
// ---------------------------------------------------------------------------

interface DimensionOption {
  dimension: Dimension;
  chartTypes: ChartType[];
}

const DIMENSION_OPTIONS: DimensionOption[] = [
  { dimension: 'year',        chartTypes: ['line', 'bar_v', 'table'] },
  { dimension: 'country',     chartTypes: ['bar_h', 'pie', 'table'] },
  { dimension: 'doc_type',    chartTypes: ['bar_h', 'bar_v', 'pie', 'table'] },
  { dimension: 'journal',     chartTypes: ['bar_h', 'table'] },
  { dimension: 'open_access', chartTypes: ['pie', 'bar_v', 'table'] },
  { dimension: 'thematic',    chartTypes: ['bar_h', 'table'] },
];

// ---------------------------------------------------------------------------
// ChartBuilderPanel
// ---------------------------------------------------------------------------

export function ChartBuilderPanel() {
  const addBuilderCard = useDashboardStore((s) => s.addBuilderCard);

  const [isOpen, setIsOpen] = useState(false);
  const [selectedDim, setSelectedDim] = useState<Dimension>('country');
  const [selectedType, setSelectedType] = useState<ChartType>('bar_h');

  const currentOption = DIMENSION_OPTIONS.find((o) => o.dimension === selectedDim)!;

  function handleDimensionChange(dim: Dimension) {
    setSelectedDim(dim);
    const option = DIMENSION_OPTIONS.find((o) => o.dimension === dim)!;
    // При смене измерения авто-выбираем первый доступный тип
    if (!option.chartTypes.includes(selectedType)) {
      setSelectedType(option.chartTypes[0]);
    }
  }

  function handleAdd() {
    addBuilderCard({ dimension: selectedDim, chartType: selectedType });
    setIsOpen(false);
  }

  function handleCancel() {
    setIsOpen(false);
  }

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        aria-label="Add chart"
        className="flex items-center gap-2 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700 px-5 py-4 text-sm font-medium text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-all w-full"
      >
        <span className="text-lg leading-none" aria-hidden>+</span>
        Add chart
      </button>
    );
  }

  return (
    <div
      role="region"
      aria-label="Chart builder"
      className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 flex flex-col gap-5 shadow-sm"
    >
      {/* Выбор измерения */}
      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
          Choose dimension
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {DIMENSION_OPTIONS.map(({ dimension }) => {
            const colors = DIMENSION_COLORS[dimension];
            const isActive = dimension === selectedDim;
            return (
              <button
                key={dimension}
                onClick={() => handleDimensionChange(dimension)}
                aria-pressed={isActive}
                className={[
                  'flex items-center gap-2 rounded-lg border px-3 py-2 text-sm text-left transition-all',
                  isActive
                    ? 'border-slate-900 dark:border-slate-100 bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-slate-100 font-medium'
                    : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800',
                ].join(' ')}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: colors.base }}
                  aria-hidden
                />
                {colors.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Выбор типа чарта */}
      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
          Choose chart type
        </p>
        <div className="flex flex-wrap gap-2">
          {currentOption.chartTypes.map((type) => {
            const isActive = type === selectedType;
            return (
              <button
                key={type}
                onClick={() => setSelectedType(type)}
                aria-pressed={isActive}
                className={[
                  'rounded-md border px-3 py-1.5 text-sm transition-all',
                  isActive
                    ? 'border-slate-900 dark:border-slate-100 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-medium'
                    : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800',
                ].join(' ')}
              >
                {CHART_TYPE_LABELS[type]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Кнопки действий */}
      <div className="flex items-center gap-3 pt-1">
        <button
          onClick={handleAdd}
          className="rounded-md bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-sm font-medium px-4 py-2 hover:bg-slate-700 dark:hover:bg-slate-200 transition-colors"
        >
          Add to page
        </button>
        <button
          onClick={handleCancel}
          className="text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
