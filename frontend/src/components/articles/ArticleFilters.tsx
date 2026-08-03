import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Checkbox } from '../ui/checkbox';
import { getLabelMaps } from '../../constants/labelTranslations';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '../ui/command';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '../ui/sheet';
import { useStatsStore } from '../../stores/statsStore';
import { useHistoryStore } from '../../stores/historyStore';
import { useArticleStore } from '../../stores/articleStore';
import { SCOPUS_DOC_TYPES } from '../../constants/scopusFilters';
import { ALL_COUNTRIES } from '../../constants/countries';

// ---------------------------------------------------------------------------
// MultiSelectCombobox — переиспользуемый Popover + Command multi-select
// ---------------------------------------------------------------------------

interface MultiSelectProps {
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
  placeholder: string;
  searchPlaceholder: string;
  'aria-label'?: string;
  getDisplayLabel?: (opt: string) => string;
}

function MultiSelectCombobox({
  options,
  selected,
  onToggle,
  placeholder,
  searchPlaceholder,
  'aria-label': ariaLabel,
  getDisplayLabel,
}: MultiSelectProps) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const display = (opt: string) => getDisplayLabel ? getDisplayLabel(opt) : opt;

  // Опции приходят из источника, не гарантирующего алфавитный порядок
  // (SCOPUS_DOC_TYPES — вручную по значимости; catalog-режим — по count из
  // statsStore; ALL_COUNTRIES в scopus-режиме отсортирован по EN в исходнике,
  // но не по RU/sr-Latn), из-за чего списки могли идти вперемежку. Сортируем
  // по отображаемому (переведённому) лейблу через localeCompare — алфавитный
  // порядок для EN/RU/sr-Latn(cnr) в их собственном алфавите, а не по
  // исходному английскому значению.
  const sortedOptions = [...options].sort((a, b) =>
    display(a).localeCompare(display(b), i18n.language),
  );

  return (
    <div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            aria-label={ariaLabel}
            aria-expanded={open}
            className="w-full justify-between text-left font-normal text-sm truncate"
          >
            <span className="truncate">
              {selected.length > 0 ? t('articles.selectedCount', { count: selected.length }) : placeholder}
            </span>
            <span className="ml-2 shrink-0 text-slate-400 text-xs">▾</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="p-0 w-60" align="start">
          <Command>
            <CommandInput placeholder={searchPlaceholder} />
            <CommandList>
              <CommandEmpty>{t('filters.noResults')}</CommandEmpty>
              <CommandGroup>
                {sortedOptions.map((opt) => {
                  const label = display(opt);
                  // value включает оригинал + перевод для двуязычного поиска
                  const searchValue = label !== opt ? `${opt} ${label}` : opt;
                  return (
                    <CommandItem
                      key={opt}
                      value={searchValue}
                      onSelect={() => onToggle(opt)}
                      data-checked={selected.includes(opt) ? 'true' : undefined}
                    >
                      {label}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {selected.map((val) => (
            <Badge
              key={val}
              variant="secondary"
              className="cursor-pointer text-xs"
              onClick={() => onToggle(val)}
            >
              {display(val)} ×
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// FiltersContent — основная логика панели фильтров
// ---------------------------------------------------------------------------

function FiltersContent() {
  const { t, i18n } = useTranslation();
  const labelMaps = getLabelMaps(i18n.language);
  const stats      = useStatsStore((s) => s.stats);
  const { historyFilters: filters, setHistoryFilters: setFilters, resetFilters } = useHistoryStore();
  const searchMode    = useArticleStore((s) => s.searchMode);
  const fetchArticles = useArticleStore((s) => s.fetchArticles);
  const setPage       = useArticleStore((s) => s.setPage);
  const liveResults   = useArticleStore((s) => s.liveResults);

  // Индикатор «фильтры изменились, нужен новый поиск» — только в Scopus-режиме
  const [filtersChanged, setFiltersChanged] = useState(false);
  const yearDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Когда Scopus-поиск завершён (liveResults обновились) — убираем индикатор
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setFiltersChanged(false); }, [liveResults]);

  // ---------------------------------------------------------------------------
  // Режимно-зависимые источники данных для опций
  // ---------------------------------------------------------------------------

  const docTypes = searchMode === 'catalog'
    ? (stats?.by_doc_type?.map((d) => d.label) ?? [])
    : [...SCOPUS_DOC_TYPES];

  const countries = searchMode === 'catalog'
    ? (stats?.by_country?.map((c) => c.label) ?? [])
    : [...ALL_COUNTRIES];

  const years = searchMode === 'catalog'
    ? (stats?.by_year?.map((y) => parseInt(y.label, 10)).filter(Boolean) ?? [])
    : [];
  const minYear = years.length ? Math.min(...years) : 1900;
  const maxYear = years.length ? Math.max(...years) : new Date().getFullYear();

  // ---------------------------------------------------------------------------
  // Обработчики изменений фильтров
  // ---------------------------------------------------------------------------

  // Применяет фильтры согласно режиму:
  //   catalog — авто-ре-фетч с первой страницы
  //   scopus  — показывает badge «search again»
  function onFilterChange() {
    if (searchMode === 'catalog') {
      setPage(1);
      fetchArticles();
    } else {
      setFiltersChanged(true);
    }
  }

  function handleYearChange(field: 'yearFrom' | 'yearTo', value: number | undefined) {
    setFilters({ [field]: value });
    if (yearDebounceRef.current) clearTimeout(yearDebounceRef.current);
    yearDebounceRef.current = setTimeout(onFilterChange, 400);
  }

  function toggleDocType(type: string) {
    const current = filters.docTypes ?? [];
    const updated = current.includes(type)
      ? current.filter((t) => t !== type)
      : [...current, type];
    setFilters({ docTypes: updated.length ? updated : undefined });
    onFilterChange();
  }

  function toggleCountry(country: string) {
    const current = filters.countries ?? [];
    const updated = current.includes(country)
      ? current.filter((c) => c !== country)
      : [...current, country];
    setFilters({ countries: updated.length ? updated : undefined });
    onFilterChange();
  }

  function handleOAChange(checked: boolean | 'indeterminate') {
    setFilters({ openAccessOnly: checked === true ? true : undefined });
    onFilterChange();
  }

  function handleClearFilters() {
    resetFilters();
    setFiltersChanged(false);
    if (searchMode === 'catalog') {
      setPage(1);
      fetchArticles();
    }
  }

  const hasActiveFilters =
    !!filters.yearFrom ||
    !!filters.yearTo ||
    (filters.docTypes?.length ?? 0) > 0 ||
    !!filters.openAccessOnly ||
    (filters.countries?.length ?? 0) > 0;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="flex flex-col gap-5 py-2">

      {/* Scopus-режим: badge «фильтры изменились» */}
      {searchMode === 'scopus' && filtersChanged && (
        <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          {t('filters.filtersChanged')}
        </div>
      )}

      {/* Year range */}
      <section>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">
          {t('filters.sectionYear')}
        </p>
        <div className="flex gap-2 items-center">
          <input
            type="number"
            min={minYear}
            max={filters.yearTo ?? maxYear}
            value={filters.yearFrom ?? ''}
            placeholder={String(minYear)}
            onChange={(e) =>
              handleYearChange('yearFrom', e.target.value ? +e.target.value : undefined)
            }
            className="w-20 rounded border border-slate-200 dark:border-slate-600 bg-transparent px-2 py-1 text-sm"
            aria-label={t('filters.yearFrom')}
          />
          <span className="text-slate-400">–</span>
          <input
            type="number"
            min={filters.yearFrom ?? minYear}
            max={maxYear}
            value={filters.yearTo ?? ''}
            placeholder={String(maxYear)}
            onChange={(e) =>
              handleYearChange('yearTo', e.target.value ? +e.target.value : undefined)
            }
            className="w-20 rounded border border-slate-200 dark:border-slate-600 bg-transparent px-2 py-1 text-sm"
            aria-label={t('filters.yearTo')}
          />
        </div>
      </section>

      {/* Document type — Popover + Command multi-select */}
      <section>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">
          {t('filters.sectionDocType')}
        </p>
        <MultiSelectCombobox
          options={docTypes}
          selected={filters.docTypes ?? []}
          onToggle={toggleDocType}
          placeholder={t('filters.allTypes')}
          searchPlaceholder={t('filters.searchType')}
          aria-label={t('filters.docTypeLabel')}
          getDisplayLabel={labelMaps ? (opt) => labelMaps.doc_type[opt] ?? opt : undefined}
        />
      </section>

      {/* Open Access */}
      <section>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <Checkbox
            checked={!!filters.openAccessOnly}
            onCheckedChange={handleOAChange}
          />
          <span>{t('filters.openAccessOnly')}</span>
        </label>
      </section>

      {/* Countries — Popover + Command multi-select с поиском */}
      <section>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">
          {t('filters.sectionCountry')}
        </p>
        <MultiSelectCombobox
          options={countries}
          selected={filters.countries ?? []}
          onToggle={toggleCountry}
          placeholder={t('filters.allCountries')}
          searchPlaceholder={t('filters.searchCountry')}
          aria-label={t('filters.countryLabel')}
          getDisplayLabel={labelMaps ? (opt) => labelMaps.country[opt] ?? opt : undefined}
        />
      </section>

      {/* Сброс всех фильтров */}
      {hasActiveFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleClearFilters}
          className="text-xs text-slate-500 hover:text-rose-500 self-start"
        >
          {t('filters.clearFilters')}
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Публичные экспорты
// ---------------------------------------------------------------------------

// Десктопный сайдбар (lg+): компактная кнопка Filters вместо прежнего
// постоянно открытого блока — по клику разворачивает тот же набор фильтров
// прямо на странице (inline, в потоке документа), без слайд-панели/оверлея.
// size="default" (не "sm") — тот же h-8/text-sm/rounded-lg, что у кнопки
// Search в SearchBar; px-4 поверх дефолтного px-2.5 — выравнивание текста
// "Filters" под текст "Search Scopus Database" в табе режима поиска (обе
// кнопки получают одинаковый инсет: 1px border + 16px padding). gap-4 на
// родительском flex-col (SearchPage) не зависит от высоты кнопки — вертикальный
// отступ от строки поиска не меняется при росте кнопки.
//
// open/onToggle подняты в SearchPage (управляемый компонент, не local
// useState): ArticleList рендерит этот компонент из 3 разных условных JSX-веток
// (skeleton/empty/results) — при переключении между ними React размонтирует и
// заново монтирует ArticleFiltersSidebar, и local state сбрасывался бы в false
// при каждом поиске (isLoading меняет ветку на время запроса). SearchPage не
// размонтируется при поиске — состояние переживает любое количество поисков,
// сбрасываясь естественно только при уходе с /search (баг 2026-08-03).
interface ArticleFiltersSidebarProps {
  open: boolean;
  onToggle: () => void;
}

export function ArticleFiltersSidebar({ open, onToggle }: ArticleFiltersSidebarProps) {
  const { t } = useTranslation();
  return (
    <aside className="hidden lg:flex flex-col w-56 shrink-0">
      <Button
        variant="outline"
        aria-expanded={open}
        onClick={onToggle}
        className="px-4 self-start"
      >
        {t('filters.filtersButton')}
      </Button>
      {open && (
        <div className="mt-3">
          <FiltersContent />
        </div>
      )}
    </aside>
  );
}

// Мобильная версия (<lg): Sheet, открываемый кнопкой. px-4-обёртка вокруг
// FiltersContent — SheetContent сам по себе не задаёт горизонтальных отступов
// (см. SheetContent в ui/sheet.tsx), без обёртки поля фильтров упирались
// в левый край экрана вплотную (баг на проде, скриншот пользователя 2026-07-10).
// Триггер — тот же size="default" + px-4, что у десктопной кнопки Filters
// (см. ArticleFiltersSidebar выше): h-8/text-sm/rounded-lg вместо мелкой "sm",
// левый край текста выровнен под "Search Scopus Database" и поисковую строку
// (на <lg сайдбар скрыт через hidden lg:flex — колонка результатов начинается
// у того же отступа контейнера, что и таб/инпут выше).
export function ArticleFiltersMobile() {
  const { t } = useTranslation();
  return (
    <div className="lg:hidden">
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="outline" className="px-4">
            {t('filters.filtersButton')}
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="h-full w-72 overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{t('filters.filtersButton')}</SheetTitle>
          </SheetHeader>
          <div className="px-4">
            <FiltersContent />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
