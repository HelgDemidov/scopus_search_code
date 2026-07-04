import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ChartCard } from '../charts/ChartCard';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { DIMENSION_COLORS } from '../charts/chartColors';
import { ZERO_RESULT_COLOR } from './PersonalActivityChart';
import { buildFingerprintColumns, rowRelativeIntensity } from './fingerprintData';
import type { SearchHistoryItem } from '../../types/api';

// Filter fingerprint — таймлайн-полоса состава фильтров за последние N поисков
// (docs/explore-personal-redesign/spec.md §2.2). Второй автобиографический разрез:
// «как менялся состав моих фильтров», которого нет ни в collection, ни в старом
// personal-наборе. Данные — из уже существующего GET /articles/history, без нового
// backend-эндпоинта (filters JSON уже содержит всё нужное).

const DESKTOP_MAX_COLUMNS = 15;
const MOBILE_MAX_COLUMNS = 8;

const DOC_TYPES_COLOR = DIMENSION_COLORS.doc_type.base;
const COUNTRIES_COLOR = DIMENSION_COLORS.country.base;
const YEAR_RANGE_COLOR = DIMENSION_COLORS.year.base;
const OPEN_ACCESS_COLOR = DIMENSION_COLORS.open_access.base;

// Row-relative интенсивность (0..1) → 2-значный hex alpha-суффикс. Минимум 15% —
// самая слабая ячейка строки всё ещё различима на фоне карточки.
function alphaHex(intensity: number): string {
  const alpha = Math.round((0.15 + intensity * 0.85) * 255);
  return alpha.toString(16).padStart(2, '0');
}

function formatColumnLabel(iso: string, lang: string): string {
  return new Intl.DateTimeFormat(lang, { month: 'numeric', day: 'numeric' }).format(new Date(iso));
}

const stickyHeaderCellClass =
  'px-2 py-1 text-left text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap sticky left-0 bg-white dark:bg-[#152236]';

// Кап на ширину столбца данных: w-full распределяет свободное место карточки
// между столбцами (решает "скученность" слева при 8-15 столбцах), но при
// малом числе поисков (1-3 колонки) без капа те же 2-3 столбца растягивались
// бы на всю ширину карточки — одна цифра в блоке ~600px (post-prod fix, §14.2).
const dataCellMaxWidth = 'max-w-[112px]';

interface FilterFingerprintStripProps {
  items: SearchHistoryItem[];
  isLoading: boolean;
}

export function FilterFingerprintStrip({ items, isLoading }: FilterFingerprintStripProps) {
  const { t, i18n } = useTranslation();
  const isMobile = useMediaQuery('(max-width: 767px)');
  const maxColumns = isMobile ? MOBILE_MAX_COLUMNS : DESKTOP_MAX_COLUMNS;

  const columns = useMemo(() => buildFingerprintColumns(items, maxColumns), [items, maxColumns]);
  const docTypesIntensity = useMemo(() => rowRelativeIntensity(columns.map((c) => c.docTypesCount)), [columns]);
  const countriesIntensity = useMemo(() => rowRelativeIntensity(columns.map((c) => c.countriesCount)), [columns]);
  const yearRangeIntensity = useMemo(() => rowRelativeIntensity(columns.map((c) => c.yearRangeWidth)), [columns]);

  return (
    <ChartCard title={t('explore.personal.fingerprint.title')} isLoading={isLoading} skeletonHeight="h-48">
      {columns.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400 py-8 text-center">
          {t('explore.personal.fingerprint.empty')}
        </p>
      ) : (
        <div className="overflow-x-auto mt-2 mb-2">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700">
                <th className={stickyHeaderCellClass}>{t('explore.personal.fingerprint.rowDate')}</th>
                {columns.map((c, i) => (
                  <th
                    key={i}
                    className={`px-2 py-2 text-center text-xs font-medium text-slate-400 tabular-nums whitespace-nowrap align-bottom ${dataCellMaxWidth}`}
                  >
                    <div className="flex flex-col items-center gap-1">
                      <span>{formatColumnLabel(c.createdAt, i18n.language)}</span>
                      {c.isZeroResult && (
                        <span
                          aria-label={t('explore.personal.fingerprint.zeroResultMarker')}
                          className="inline-block w-1.5 h-1.5 rounded-full"
                          style={{ backgroundColor: ZERO_RESULT_COLOR }}
                        />
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row" className={stickyHeaderCellClass}>
                  {t('explore.personal.fingerprint.rowOpenAccess')}
                </th>
                {columns.map((c, i) => (
                  <td key={i} className={`px-2 py-1 text-center ${dataCellMaxWidth}`}>
                    <span
                      className="inline-block w-2.5 h-2.5 rounded-full"
                      style={{
                        backgroundColor: c.openAccessUsed ? OPEN_ACCESS_COLOR : 'transparent',
                        border: c.openAccessUsed ? 'none' : '1px solid #cbd5e1',
                      }}
                    />
                  </td>
                ))}
              </tr>

              <tr>
                <th scope="row" className={stickyHeaderCellClass}>
                  {t('explore.personal.fingerprint.rowDocTypes')}
                </th>
                {columns.map((c, i) => (
                  <td
                    key={i}
                    className={`px-2 py-1 text-center tabular-nums text-slate-900 dark:text-slate-100 ${dataCellMaxWidth}`}
                    style={{ backgroundColor: `${DOC_TYPES_COLOR}${alphaHex(docTypesIntensity[i])}` }}
                  >
                    {c.docTypesCount}
                  </td>
                ))}
              </tr>

              <tr>
                <th scope="row" className={stickyHeaderCellClass}>
                  {t('explore.personal.fingerprint.rowCountries')}
                </th>
                {columns.map((c, i) => (
                  <td
                    key={i}
                    className={`px-2 py-1 text-center tabular-nums text-slate-900 dark:text-slate-100 ${dataCellMaxWidth}`}
                    style={{ backgroundColor: `${COUNTRIES_COLOR}${alphaHex(countriesIntensity[i])}` }}
                  >
                    {c.countriesCount}
                  </td>
                ))}
              </tr>

              <tr>
                <th scope="row" className={stickyHeaderCellClass}>
                  {t('explore.personal.fingerprint.rowYearRange')}
                </th>
                {columns.map((c, i) => (
                  <td
                    key={i}
                    className={`px-2 py-1 text-center tabular-nums text-slate-900 dark:text-slate-100 ${dataCellMaxWidth}`}
                    style={
                      c.yearRangeWidth !== null
                        ? { backgroundColor: `${YEAR_RANGE_COLOR}${alphaHex(yearRangeIntensity[i])}` }
                        : undefined
                    }
                  >
                    {c.yearRangeWidth ?? '—'}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </ChartCard>
  );
}
