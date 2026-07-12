import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { postNlPivotQuery } from '../../api/stats';
import { useAuthStore } from '../../stores/authStore';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { ALL_PIVOT_DIMENSIONS } from './tableBuilderData';
import type { BuilderCard } from '../../stores/dashboardStore';

// AI-ввод в Table Builder (docs/ai-nl-pivot/spec.md §4) — альтернатива ручному AddTableForm:
// текст → POST /articles/stats/pivot/nl-query → валидные параметры pivot → те же onAdd/
// onCancel-пропсы, что у AddTableForm (TableBuilderPanel.tsx), для идентичной интеграции
// с dashboardStore.addBuilderCard() и последующим рендером через уже существующий
// PivotTableCard/PivotTable — без единой новой строчки рендер-кода pivot-данных.

type ErrorKind = 'ambiguous' | 'rateLimited' | 'unavailable' | 'generic';

function errorKindFromStatus(status: number | undefined): ErrorKind {
  if (status === 400) return 'ambiguous';
  if (status === 429) return 'rateLimited';
  if (status === 503) return 'unavailable';
  return 'generic';
}

export function NlPivotQueryForm({
  onAdd,
  onCancel,
}: {
  onAdd: (card: Omit<BuilderCard, 'id'>) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorKind, setErrorKind] = useState<ErrorKind | null>(null);
  const placeholderExamples = t('explore.tableBuilder.nlQuery.placeholderExamples', {
    returnObjects: true,
  }) as string[];
  // Один пример на монтирование (не таймер-ротация) — избегаем fake-timers в тестах
  // (feedback_vitest_testing_patterns.md), но пользователь видит разные примеры
  // при повторном открытии формы, а не всегда одну и ту же фразу.
  const [placeholderIndex] = useState(() => Math.floor(Math.random() * placeholderExamples.length));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim() || isLoading) return;

    setIsLoading(true);
    setErrorKind(null);
    try {
      const res = await postNlPivotQuery(query.trim());
      onAdd({
        rowDim: res.row_dim,
        colDim: res.col_dim,
        filterDim: res.filter_dim ?? undefined,
        filterValue: res.filter_value ?? undefined,
        metric: res.metric,
      });
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      setErrorKind(errorKindFromStatus(status));
    } finally {
      setIsLoading(false);
    }
  }

  if (!isAuthenticated) {
    return (
      <div
        role="region"
        aria-label={t('explore.tableBuilder.nlQuery.heading')}
        className="relative rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#152236] p-5 flex flex-col gap-3 shadow-sm"
      >
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {t('explore.tableBuilder.nlQuery.signInPrompt')}
        </p>
        <button
          onClick={onCancel}
          className="self-start text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
        >
          {t('explore.tableBuilder.cancel')}
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        void handleSubmit(e);
      }}
      aria-label={t('explore.tableBuilder.nlQuery.heading')}
      className="relative rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#152236] p-5 flex flex-col gap-4 shadow-sm"
    >
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
          {t('explore.tableBuilder.nlQuery.heading')}
        </span>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholderExamples[placeholderIndex]}
          disabled={isLoading}
          maxLength={300}
        />
      </label>

      <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
        <span>{t('explore.tableBuilder.nlQuery.supportedLabel')}</span>
        <ul className="flex flex-wrap gap-1 list-none m-0 p-0">
          {ALL_PIVOT_DIMENSIONS.map((dim) => (
            <li key={dim}>
              <Badge variant="secondary" className="text-xs">
                {t(`explore.dimensionLabels.${dim}`)}
              </Badge>
            </li>
          ))}
        </ul>
      </div>

      {errorKind && (
        <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">
          {t(`explore.tableBuilder.nlQuery.error.${errorKind}`)}
        </p>
      )}

      <div className="flex items-center gap-3 pt-1">
        <Button
          type="submit"
          disabled={!query.trim() || isLoading}
          size="default"
          className="bg-blue-800 hover:bg-blue-900 dark:bg-blue-500 dark:hover:bg-blue-400 text-white rounded-md"
        >
          {isLoading ? t('explore.tableBuilder.nlQuery.loading') : t('explore.tableBuilder.nlQuery.submit')}
        </Button>
        <button
          type="button"
          onClick={onCancel}
          className="text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
        >
          {t('explore.tableBuilder.cancel')}
        </button>
      </div>
    </form>
  );
}
