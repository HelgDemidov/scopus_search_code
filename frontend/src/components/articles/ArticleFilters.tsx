import { useState } from 'react';
import { Checkbox } from '../ui/checkbox';
import { Switch } from '../ui/switch';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '../ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from '../ui/command';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '../ui/sheet';
import { useStatsStore } from '../../stores/statsStore';
import { useArticleStore } from '../../stores/articleStore';
import type { ArticleFilters } from '../../types/api';

// Внутренний компонент: содержимое sidebar’а фильтров
function FiltersContent() {
  const stats = useStatsStore((s) => s.stats);
  const { filters, setFilters } = useArticleStore();
  const [countriesOpen, setCountriesOpen] = useState(false);

  // Данные для фильтров: все из useStatsStore().stats по §4.1 (Б-6)
  const docTypes = stats?.by_doc_type.map((d) => d.label) ?? [];
  const countries = stats?.by_country.map((c) => c.label) ?? [];
  const years = stats?.by_year.map((y) => parseInt(y.label, 10)).filter(Boolean) ?? [];
  const minYear = years.length ? Math.min(...years) : 2000;
  const maxYear = years.length ? Math.max(...years) : new Date().getFullYear();

  // Тоггл типа документа в списке выбранных
  function toggleDocType(type: string) {
    const current = filters.docTypes ?? [];
    const updated = current.includes(type)
      ? current.filter((t) => t !== type)
      : [...current, type];
    setFilters({ docTypes: updated.length ? updated : undefined });
  }

  // Тоггл страны в мульти-селекте
  function toggleCountry(country: string) {
    const current = filters.countries ?? [];
    const updated = current.includes(country)
      ? current.filter((c) => c !== country)
      : [...current, country];
    setFilters({ countries: updated.length ? updated : undefined });
  }

  // Сброс всех фильтров (кроме keyword — он серверный)
  function clearFilters() {
    setFilters({
      yearFrom: undefined,
      yearTo: undefined,
      docTypes: undefined,
      openAccessOnly: undefined,
      countries: undefined,
    } as Partial<ArticleFilters>);
  }

  const hasActiveFilters =
    !!filters.yearFrom ||
    !!filters.yearTo ||
    (filters.docTypes?.length ?? 0) > 0 ||
    !!filters.openAccessOnly ||
    (filters.countries?.length ?? 0) > 0;

  return (
    <div className="flex flex-col gap-5 p-4">
      {/* Шапка + кнопка сброса */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          Фильтры
        </h3>
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="h-6 px-2 text-xs text-slate-500"
          >
            Сбросить все
          </Button>
        )}
      </div>

      {/* Год публикации: два поля yearFrom / yearTo */}
      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium text-slate-700 dark:text-slate-300 uppercase tracking-wide">
          Год публикации
        </p>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={minYear}
            max={filters.yearTo ?? maxYear}
            placeholder={String(minYear)}
            value={filters.yearFrom ?? ''}
            onChange={(e) =>
              setFilters({ yearFrom: e.target.value ? Number(e.target.value) : undefined })
            }
            className="w-20 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-xs text-slate-900 dark:text-slate-100"
          />
          <span className="text-xs text-slate-400">—</span>
          <input
            type="number"
            min={filters.yearFrom ?? minYear}
            max={maxYear}
            placeholder={String(maxYear)}
            value={filters.yearTo ?? ''}
            onChange={(e) =>
              setFilters({ yearTo: e.target.value ? Number(e.target.value) : undefined })
            }
            className="w-20 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-xs text-slate-900 dark:text-slate-100"
          />
        </div>
      </div>

      {/* Тип документа: чекбоксы со счётчиком */}
      {docTypes.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-slate-700 dark:text-slate-300 uppercase tracking-wide">
            Тип документа
          </p>
          <div className="flex flex-col gap-1.5">
            {docTypes.map((type) => {
              const count = stats?.by_doc_type.find((d) => d.label === type)?.count ?? 0;
              const checked = (filters.docTypes ?? []).includes(type);
              return (
                <label
                  key={type}
                  className="flex items-center gap-2 cursor-pointer group"
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => toggleDocType(type)}
                    id={`doctype-${type}`}
                  />
                  <span className="text-xs text-slate-700 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-slate-100 flex-1 truncate">
                    {type}
                  </span>
                  <span className="text-xs text-slate-400">{count}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* Open Access — toggle */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
          Только Open Access
        </span>
        <Switch
          checked={!!filters.openAccessOnly}
          onCheckedChange={(checked) =>
            setFilters({ openAccessOnly: checked || undefined })
          }
        />
      </div>

      {/* Страна аффиляции: Popover + Command для multi-select с поиском */}
      {countries.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-slate-700 dark:text-slate-300 uppercase tracking-wide">
            Страна
          </p>

          {/* Выбранные страны как badges */}
          {(filters.countries?.length ?? 0) > 0 && (
            <div className="flex flex-wrap gap-1">
              {filters.countries!.map((c) => (
                <Badge
                  key={c}
                  variant="secondary"
                  className="text-xs cursor-pointer"
                  onClick={() => toggleCountry(c)}
                >
                  {c} ×
                </Badge>
              ))}
            </div>
          )}

          <Popover open={countriesOpen} onOpenChange={setCountriesOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="w-full justify-start text-xs font-normal text-slate-500">
                Выбрать страны…
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-60 p-0" align="start">
              <Command>
                <CommandInput placeholder="Search country…" className="h-8 text-xs" />
                <CommandEmpty className="text-xs py-4 text-center">
                  Страна не найдена.
                </CommandEmpty>
                <CommandGroup className="max-h-52 overflow-y-auto">
                  {countries.map((country) => {
                    const selected = (filters.countries ?? []).includes(country);
                    return (
                      <CommandItem
                        key={country}
                        onSelect={() => toggleCountry(country)}
                        className="text-xs"
                      >
                        {/* Галочка если страна выбрана */}
                        <span className={`mr-2 ${selected ? 'opacity-100' : 'opacity-0'}`}>&#10003;</span>
                        {country}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
      )}
    </div>
  );
}

// Десктоп: фильтры как постоянный sidebar
// Мобайл: выдвижной <Sheet> снизу по §4.1
export function ArticleFilters() {
  return (
    <>
      {/* Desktop sidebar (видим от lg) */}
      <aside className="hidden lg:block w-56 flex-shrink-0 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/50 self-start sticky top-[4.5rem]">
        <FiltersContent />
      </aside>

      {/* Mobile: кнопка + Sheet (дравер снизу) */}
      <div className="lg:hidden">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm" className="flex items-center gap-1.5 text-xs">
              {/* Иконка фильтра */}
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5" aria-hidden="true">
                <path d="M2 4h12M4 8h8M6 12h4" strokeLinecap="round" />
              </svg>
              Фильтры
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto">
            <SheetHeader>
              <SheetTitle className="text-sm">Фильтры</SheetTitle>
            </SheetHeader>
            <FiltersContent />
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
