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
- `frontend/src/constants/`  — application-level constants
- `frontend/src/lib/`        — utilities (cn() etc.)
- `frontend/src/test/`       — test setup: setup.ts (jest-dom matchers, loaded via setupFiles)
- `frontend/src/App.tsx`     — root component and routing
- `frontend/src/main.tsx`    — React entry point

## Test files
- `frontend/src/App.integration.test.tsx`
  — auth event bus integration tests
- `frontend/src/components/articles/pagination.integration.test.tsx`
  — pagination integration tests (PaginationBar + usePagination + articleStore)

Unit tests: `src/**/*.test.{ts,tsx}` excluding `*.integration.test.*`

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
- `articleStore`  — articles list, live Scopus results, pagination, `searchMode` (TODO: currently local useState in HomePage — not yet lifted to store), `currentKeyword` (TODO: not yet stored — keyword is ephemeral local state in SearchBar)
- `historyStore`  — search history items + `historyFilters` (client-side filter state shared between modes)
- `statsStore`    — catalog stats (by_year, by_country, by_doc_type); pre-fetched in `App.tsx:194` on startup; used by ArticleFilters sidebar for filter options in catalog mode
- `authStore`     — JWT token, user, hydration state
- `quotaStore`    — Scopus weekly quota (remaining/limit/reset_at)

## Critical architectural notes
- `fetchStats()` is called globally in `App.tsx` on app startup — stats are always available before any component renders; no need to call it again in individual components
- `searchMode` ('scopus' | 'catalog') is currently `useState` local to `HomePage.tsx` — NOT in any store. ArticleFilters has no access to it. This is a known limitation.
- `historyFilters` in `historyStore` is the source of truth for active filter state; both `fetchArticles()` and `searchScopusLive()` read it via `useHistoryStore.getState()` at call time
- Changing `historyFilters` does NOT auto-trigger a re-fetch. Filters are only applied on the next explicit search submission.

## Conventions
- Components: PascalCase `.tsx`; utilities: camelCase `.ts`
- API calls only in `frontend/src/api/`, never in components
- Global state via Zustand stores only (`frontend/src/stores/`), not component-local state
- shadcn/ui components in `src/components/ui/` are inlined (not npm-imported) and have already been customized for this project (`command.tsx` uses custom InputGroup and icons; `input-group.tsx` is a non-standard addition). Direct edits are allowed. Prefer extending through composition for minor additions.
- `"type": "module"` in package.json — ESM only, no CommonJS