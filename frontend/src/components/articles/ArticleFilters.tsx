import { useState } from 'react';
import { Checkbox } from '../ui/checkbox';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '../ui/sheet';
import { useStatsStore } from '../../stores/statsStore';
import { useHistoryStore } from '../../stores/historyStore';
import type { ArticleClientFilters } from '../../types/api';

// Внутренний компонент: содержимое панели фильтров
function FiltersContent() {
  const stats = useStatsStore((s) => s.stats);
  // Фильтры живут в historyStore согласно §1.3 (filter-slice split)
  const { historyFilters: filters, setHistoryFilters: setFilters } = useHistoryStore();
  // Локальный стейт строки поиска по странам — не часть фильтров стора
  const [countryQuery, setCountryQuery] = useState('');

  // Данные фильтров из useStatsStore().stats согласно §4.1 (Б-6)
  // stats?.X guards против stats===null/undefined; stats?.X?.map() также
  // guards против undefined sub-field (например при инициализации стора)
  const docTypes  = stats?.by_doc_type?.map((d) => d.label) ?? [];
  const countries = stats?.by_country?.map((c) => c.label) ?? [];
  const years     = stats?.by_year?.map((y) => parseInt(y.label, 10)).filter(Boolean) ?? [];
  const minYear = years.length ? Math.min(...years) : 2000;
  const maxYear = years.length ? Math.max(...years) : new Date().getFullYear();

  // Страны, отфильтрованные по строке поиска (живая фильтрация без API)
  const filteredCountries = countryQuery.trim()
    ? countries.filter((c) =>
        c.toLowerCase().includes(countryQuery.toLowerCase())
      )
    : countries;

  // Переключает тип документа в списке выбранных
  function toggleDocType(type: string) {
    const current = filters.docTypes ?? [];
    const updated = current.includes(type)
      ? current.filter((t) => t !== type)
      : [...current, type];
    setFilters({ docTypes: updated.length ? updated : undefined });
  }

  // Переключает страну в мульти-селекте
  function toggleCountry(country: string) {
    const current = filters.countries ?? [];
    const updated = current.includes(country)
      ? current.filter((c) => c !== country)
      : [...current, country];
    setFilters({ countries: updated.length ? updated : undefined });
  }

  // Сбрасывает все фильтры (keyword остается в articleStore — он серверный)
  function clearFilters() {
    setFilters({
      yearFrom: undefined,
      yearTo: undefined,
      docTypes: undefined,
      openAccessOnly: undefined,
      countries: undefined,
    } as Partial<ArticleClientFilters>);
  }

  const hasActiveFilters =
    !!filters.yearFrom ||
    !!filters.yearTo ||
    (filters.docTypes?.length ?? 0) > 0 ||
    !!filters.openAccessOnly ||
    (filters.countries?.length ?? 0) > 0;

  return (
    <div className="flex flex-col gap-5 py-2">

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
              setFilters({ yearFrom: e.target.value ? +e.target.value : undefined })
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
              setFilters({ yearTo: e.target.value ? +e.target.value : undefined })
            }
            className="w-20 rounded border border-slate-200 dark:border-slate-600 bg-transparent px-2 py-1 text-sm"
            aria-label="Year to"
          />
        </div>
      </section>

      {/* Document types — нативный аккордеон без дополнительных зависимостей */}
      <details open className="group">
        <summary className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2 cursor-pointer list-none flex items-center justify-between">
          Document type
          <span className="text-slate-400 group-open:rotate-180 transition-transform text-xs">▾</span>
        </summary>
        <div className="flex flex-col gap-1.5 mt-2">
          {docTypes.map((type) => (
            <label key={type} className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox
                checked={(filters.docTypes ?? []).includes(type)}
                onCheckedChange={() => toggleDocType(type)}
              />
              {type}
            </label>
          ))}
        </div>
      </details>

      {/* Open Access — Checkbox семантически точнее Switch для группы фильтров */}
      <section>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <Checkbox
            checked={!!filters.openAccessOnly}
            onCheckedChange={(checked) =>
              setFilters({ openAccessOnly: checked === true ? true : undefined })
            }
          />
          <span>Open Access only</span>
        </label>
      </section>

      {/* Countries — predictive input вместо Popover+Command */}
      <section>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">
          Country
        </p>

        {/* Строка живой фильтрации списка стран */}
        <input
          type="text"
          value={countryQuery}
          onChange={(e) => setCountryQuery(e.target.value)}
          placeholder="Search country…"
          className="w-full rounded border border-slate-200 dark:border-slate-600 bg-transparent px-2 py-1 text-sm mb-1"
          aria-label="Filter countries"
        />

        {/* Список стран с прокруткой */}
        <ul className="max-h-40 overflow-y-auto flex flex-col gap-1">
          {filteredCountries.map((country) => (
            <li key={country}>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox
                  checked={(filters.countries ?? []).includes(country)}
                  onCheckedChange={() => toggleCountry(country)}
                />
                {country}
              </label>
            </li>
          ))}
          {filteredCountries.length === 0 && (
            <li className="text-xs text-slate-400 px-1 py-1">No countries found</li>
          )}
        </ul>

        {/* Бейджи выбранных стран */}
        {(filters.countries?.length ?? 0) > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {filters.countries!.map((c) => (
              <Badge
                key={c}
                variant="secondary"
                className="cursor-pointer"
                onClick={() => toggleCountry(c)}
              >
                {c} ×
              </Badge>
            ))}
          </div>
        )}
      </section>

      {/* Кнопка сброса всех фильтров */}
      {hasActiveFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={clearFilters}
          className="text-xs text-slate-500 hover:text-rose-500 self-start"
        >
          Clear filters
        </Button>
      )}
    </div>
  );
}

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
