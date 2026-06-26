import { useState, useEffect, useRef } from 'react';
import { Checkbox } from '../ui/checkbox';
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
import { SCOPUS_DOC_TYPES, SCOPUS_COUNTRIES } from '../../constants/scopusFilters';

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
}

function MultiSelectCombobox({
  options,
  selected,
  onToggle,
  placeholder,
  searchPlaceholder,
  'aria-label': ariaLabel,
}: MultiSelectProps) {
  const [open, setOpen] = useState(false);

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
              {selected.length > 0 ? `${selected.length} selected` : placeholder}
            </span>
            <span className="ml-2 shrink-0 text-slate-400 text-xs">▾</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="p-0 w-60" align="start">
          <Command>
            <CommandInput placeholder={searchPlaceholder} />
            <CommandList>
              <CommandEmpty>No results found</CommandEmpty>
              <CommandGroup>
                {options.map((opt) => (
                  <CommandItem
                    key={opt}
                    value={opt}
                    onSelect={() => onToggle(opt)}
                    data-checked={selected.includes(opt) ? 'true' : undefined}
                  >
                    {opt}
                  </CommandItem>
                ))}
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
              {val} ×
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
    : [...SCOPUS_COUNTRIES];

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
          Filters changed — search again to apply
        </div>
      )}

      {/* Year range */}
      <section>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">
          Year
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
            aria-label="Year from"
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
            aria-label="Year to"
          />
        </div>
      </section>

      {/* Document type — Popover + Command multi-select */}
      <section>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">
          Document type
        </p>
        <MultiSelectCombobox
          options={docTypes}
          selected={filters.docTypes ?? []}
          onToggle={toggleDocType}
          placeholder="All types"
          searchPlaceholder="Search type…"
          aria-label="Document type filter"
        />
      </section>

      {/* Open Access */}
      <section>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <Checkbox
            checked={!!filters.openAccessOnly}
            onCheckedChange={handleOAChange}
          />
          <span>Open Access only</span>
        </label>
      </section>

      {/* Countries — Popover + Command multi-select с поиском */}
      <section>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">
          Country
        </p>
        <MultiSelectCombobox
          options={countries}
          selected={filters.countries ?? []}
          onToggle={toggleCountry}
          placeholder="All countries"
          searchPlaceholder="Search country…"
          aria-label="Country filter"
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
          Clear filters
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Публичные экспорты
// ---------------------------------------------------------------------------

// Десктопный сайдбар: всегда виден на lg+
export function ArticleFiltersSidebar() {
  return (
    <aside className="hidden lg:flex flex-col w-56 shrink-0">
      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">Filters</p>
      <FiltersContent />
    </aside>
  );
}

// Мобильная версия: Sheet, открываемый кнопкой
export function ArticleFiltersMobile() {
  return (
    <div className="lg:hidden">
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="outline" size="sm">
            Filters
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-72 overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Filters</SheetTitle>
          </SheetHeader>
          <FiltersContent />
        </SheetContent>
      </Sheet>
    </div>
  );
}
