# Frontend context
# This file is located at: frontend/CLAUDE.md
# All paths below are relative to the frontend/ directory unless stated otherwise.

## Stack
React 18 + TypeScript ~5.7 + Vite ^6.0 + Tailwind CSS 3 + shadcn/ui (Radix UI).
Charts/data: @tremor/react 3 (Recharts + D3 as transitive deps). Themes: next-themes.
Toasts: sonner. Icons: lucide-react.
State: Zustand 5 (frontend/src/stores/). Forms: react-hook-form + zod. HTTP: axios.
Router: react-router-dom 7. Tests: Vitest 4 + Testing Library (jsdom).

## frontend/ root files
- `vite.config.ts`    — Vite + Vitest config; path alias @/ → src/; Tailwind via PostCSS
- `tailwind.config.ts`— Tailwind v3 config (NOT v4 — do not add @tailwindcss/vite)
- `tsconfig.json`     — TypeScript config
- `components.json`   — shadcn/ui config
- `vercel.json`       — Vercel deployment config
- `package.json`      — dependencies and scripts

## frontend/src/ structure
- `frontend/src/api/`        — HTTP clients; all API calls go here, never in components
- `frontend/src/components/` — UI components; shadcn/ui in `src/components/ui/` — do not edit directly
- `frontend/src/pages/`      — page-level route components
- `frontend/src/stores/`     — Zustand stores (global state only)
- `frontend/src/hooks/`      — custom React hooks
- `frontend/src/types/`      — TypeScript types and interfaces
- `frontend/src/constants/`  — application-level constants (scopusFilters.ts — SCOPUS_DOC_TYPES, SCOPUS_COUNTRIES)
- `frontend/src/lib/`        — utilities (cn() etc.)
- `frontend/src/test/`       — test setup: setup.ts (jest-dom matchers, loaded via setupFiles)
- `frontend/src/App.tsx`     — root component and routing
- `frontend/src/main.tsx`    — React entry point

## Test files (co-location pattern — тест рядом с источником)
- `frontend/src/App.integration.test.tsx`            — auth event bus integration tests
- `frontend/src/api/articles.test.ts`                — API param tests (B5 regression suite)
- `frontend/src/components/articles/ArticleFilters.test.tsx` — dual-mode filters (40 unit tests)
- `frontend/src/components/articles/pagination.integration.test.tsx` — pagination integration

Unit tests: `src/**/*.test.{ts,tsx}` excluding `*.integration.test.*`
Total frontend tests (main, 2026-06-25): **169** (все зелёные).

Coverage scope (test:coverage / CI): PaginationBar.tsx, usePagination.ts, articleStore.ts.

## CI: .github/workflows/frontend-tests.yml
Three parallel jobs — triggers on push to main and feature branches when `frontend/**` changes:

| Job | What it runs | Command |
|---|---|---|
| `typecheck` | Full TypeScript type check | `npx tsc --noEmit` |
| `unit` | All `*.test.{ts,tsx}` excluding `*.integration.test.*` | `npx vitest run --exclude 'src/**/*.integration.test.*' src/**/*.test.ts src/**/*.test.tsx` |
| `integration` | Both integration test files explicitly | `npx vitest run src/components/articles/pagination.integration.test.tsx src/App.integration.test.tsx` |

Node.js version in CI: **22** (not 24; `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true` is set for actions runner only).
Coverage is collected in the `integration` job and posted to GitHub Actions Job Summary.

## Commands (run from frontend/)
```bash
npm run test             # vitest run (single pass)
npm run test:watch       # vitest (interactive mode)
npm run test:coverage    # vitest run --coverage (scoped — 3 files only, see above)
npm run lint             # eslint
npm run build            # tsc -b && vite build
```

## Build notes
- Tailwind v3 via PostCSS — do NOT switch to @tailwindcss/vite (that is v4 only)
- vendor-charts chunk (Tremor + Recharts + D3) ~850 kB raw is intentional;
  chunkSizeWarningLimit=1000 in vite.config.ts — this Rollup warning is expected, not a bug

## Key stores and responsibilities
- `articleStore`  — articles list, live Scopus results, pagination, `searchMode` ('catalog'|'scopus'), `currentKeyword`; `setSearchMode()` автоматически вызывает `historyStore.resetFilters()`
- `historyStore`  — search history items + `historyFilters` (клиентские фильтры, shared между режимами) + `resetFilters()` → сбрасывает historyFilters в `{}`
- `statsStore`    — catalog stats (by_year, by_country, by_doc_type); pre-fetched в `App.tsx` на старте; используется ArticleFilters в catalog-режиме как источник опций фильтров
- `authStore`     — JWT token, user, hydration state
- `quotaStore`    — Scopus weekly quota (remaining/limit/reset_at)

## Dual-mode filtering system (filtering-2, merged 2026-06-25)

### Режимная логика (FiltersContent в ArticleFilters.tsx)
- **Catalog**: любое изменение фильтра → `setPage(1)` + `fetchArticles()` (год — debounce 400 мс)
- **Scopus**: любое изменение фильтра → amber-badge «Filters changed — search again to apply»; badge сбрасывается через `useEffect(() => setFiltersChanged(false), [liveResults])` когда поиск завершается

### Источники опций — зависят от режима
| Фильтр | Catalog | Scopus |
|---|---|---|
| doc_types | `statsStore.stats.by_doc_type` | `SCOPUS_DOC_TYPES` (constants/scopusFilters.ts) |
| countries | `statsStore.stats.by_country` | `SCOPUS_COUNTRIES` (constants/scopusFilters.ts) |
| year range | min/max из `stats.by_year` | без ограничений (1900 — текущий год) |

### Архитектура ArticleFilters.tsx
- `MultiSelectCombobox` — переиспользуемый Popover+Command multi-select с live-поиском и badge-чипами
- `FiltersContent` — вся бизнес-логика (не экспортируется напрямую)
- `ArticleFiltersSidebar` — desktop aside (hidden lg:flex w-56) — публичный экспорт
- `ArticleFiltersMobile` — mobile Sheet (lg:hidden) — публичный экспорт

## Critical architectural notes
- `fetchStats()` вызывается в `App.tsx` при старте — stats всегда доступны до первого рендера
- `searchMode` находится в `articleStore` — доступен любому компоненту через `useArticleStore(s => s.searchMode)`; больше НЕ является локальным useState в HomePage
- `setSearchMode()` автоматически вызывает `historyStore.resetFilters()` при смене режима
- `historyFilters` в `historyStore` — единственный источник истины для фильтров; `fetchArticles()` и `searchScopusLive()` читают через `useHistoryStore.getState()` в момент вызова
- `setHistoryFilters()` сам по себе НЕ триггерит ре-фетч — в catalog-режиме это делает `onFilterChange()` внутри FiltersContent; в scopus-режиме ре-фетч не происходит до следующего явного поиска

## Vitest testing patterns (выученные уроки)

### Checkbox mock — используй button, не input
`fireEvent.change` на контролируемом `<input type="checkbox" checked={false}>` ненадёжен в jsdom
(e.target.checked может не отражать переданный инициализатор). Вместо этого:
```tsx
vi.mock('../ui/checkbox', () => ({
  Checkbox: ({ checked, onCheckedChange }) => (
    <button role="checkbox" aria-checked={!!checked}
      onClick={() => onCheckedChange?.(!checked)} />
  ),
}));
// В тесте: fireEvent.click(screen.getByRole('checkbox'))
```

### Fake timers + React Testing Library — опасная комбинация
`vi.useFakeTimers()` внутри тела теста мешает RTL cleanup (React effects не завершаются) →
следующие тесты видят дублирующиеся DOM-элементы. Предпочтительная альтернатива:
```typescript
// Тест debounce-механизма без fake timers:
const spy = vi.spyOn(globalThis, 'setTimeout');
fireEvent.change(input, { target: { value: '2020' } });
expect(spy).toHaveBeenCalledWith(expect.any(Function), 400);
spy.mockRestore();
```

### vi.hoisted для мутируемого состояния в vi.mock
```typescript
const { articleState } = vi.hoisted(() => ({
  articleState: { searchMode: 'catalog', fetchArticles: vi.fn(), ... }
}));
vi.mock('../../stores/articleStore', () => ({
  useArticleStore: (sel?) => sel ? sel(articleState) : articleState,
}));
// beforeEach: articleState.fetchArticles = vi.fn() — переназначение работает
```

## Conventions
- Components: PascalCase `.tsx`; utilities: camelCase `.ts`
- API calls only in `frontend/src/api/`, never in components
- Global state via Zustand stores only (`frontend/src/stores/`), not component-local state
- shadcn/ui components in `src/components/ui/` are inlined (not npm-imported) and have already been customized for this project (`command.tsx` uses custom InputGroup and icons; `input-group.tsx` is a non-standard addition). Direct edits are allowed. Prefer extending through composition for minor additions.
- `"type": "module"` in package.json — ESM only, no CommonJS
- Тестовые файлы: co-location (рядом с источником), конвенция имён: `*.test.tsx` (unit), `*.integration.test.tsx` (integration)
