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
import { useHistoryStore } from '../../stores/historyStore';
import type { ArticleClientFilters } from '../../types/api';

// Inner component: sidebar filter content
function FiltersContent() {
  const stats = useStatsStore((s) => s.stats);
  // Filters live in historyStore per §1.3 (filter-slice split)
  const { historyFilters: filters, setHistoryFilters: setFilters } = useHistoryStore();
  const [countriesOpen, setCountriesOpen] = useState(false);

  // Filter data: all from useStatsStore().stats per §4.1 (Б-6)
  // stats?.X guards against stats===null/undefined; stats?.X?.map() also
  // guards against the sub-field being undefined (e.g. during store init)
  const docTypes  = stats?.by_doc_type?.map((d) => d.label) ?? [];
  const countries = stats?.by_country?.map((c) => c.label) ?? [];
  const years     = stats?.by_year?.map((y) => parseInt(y.label, 10)).filter(Boolean) ?? [];
  const minYear = years.length ? Math.min(...years) : 2000;
  const maxYear = years.length ? Math.max(...years) : new Date().getFullYear();

  // Toggle document type in the selection list
  function toggleDocType(type: string) {
    const current = filters.docTypes ?? [];
    const updated = current.includes(type)
      ? current.filter((t) => t !== type)
      : [...current, type];
    setFilters({ docTypes: updated.length ? updated : undefined });
  }

  // Toggle country in the multi-select
  function toggleCountry(country: string) {
    const current = filters.countries ?? [];
    const updated = current.includes(country)
      ? current.filter((c) => c !== country)
      : [...current, country];
    setFilters({ countries: updated.length ? updated : undefined });
  }

  // Reset all filters (keyword stays in articleStore — it is server-side)
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

      {/* Document types */}
      <section>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">
          Document type
        </p>
        <div className="flex flex-col gap-1.5">
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
      </section>

      {/* Open Access toggle */}
      <section>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <Switch
            checked={!!filters.openAccessOnly}
            onCheckedChange={(checked) => setFilters({ openAccessOnly: checked || undefined })}
          />
          <span>Open Access only</span>
        </label>
      </section>

      {/* Countries multi-select (Popover + Command) */}
      <section>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">
          Country
        </p>
        <Popover open={countriesOpen} onOpenChange={setCountriesOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={countriesOpen}
              className="w-full justify-between text-sm font-normal"
            >
              {(filters.countries?.length ?? 0) > 0
                ? `${filters.countries!.length} selected`
                : 'Select countries'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-0">
            <Command>
              <CommandInput placeholder="Search country…" />
              <CommandEmpty>No countries found</CommandEmpty>
              <CommandGroup className="max-h-52 overflow-y-auto">
                {countries.map((country) => (
                  <CommandItem
                    key={country}
                    value={country}
                    onSelect={() => toggleCountry(country)}
                    className="flex items-center gap-2"
                  >
                    <Checkbox checked={(filters.countries ?? []).includes(country)} />
                    {country}
                  </CommandItem>
                ))}
              </CommandGroup>
            </Command>
          </PopoverContent>
        </Popover>

        {/* Selected countries badges */}
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

      {/* Clear filters button */}
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

// Desktop sidebar: always visible on lg+
export function ArticleFiltersSidebar() {
  return (
    <aside className="hidden lg:flex flex-col w-56 shrink-0">
      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">Filters</p>
      <FiltersContent />
    </aside>
  );
}

// Mobile: Sheet triggered by a button
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
