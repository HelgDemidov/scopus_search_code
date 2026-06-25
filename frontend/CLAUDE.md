# Frontend context
# All paths relative to frontend/ unless stated otherwise.

## Stack
React 18 + TypeScript ~5.7 + Vite ^6.0 + Tailwind CSS 3 + shadcn/ui (Radix UI).
State: Zustand 5. HTTP: axios. Router: react-router-dom 7. Tests: Vitest 4 + Testing Library (jsdom).
Charts: @tremor/react 3. Forms: react-hook-form + zod. Toasts: sonner. Icons: lucide-react.

## src/ structure
- `api/`        — HTTP clients; все вызовы сюда, не в компоненты
- `components/` — UI; `components/ui/` — shadcn/ui (inline, кастомизированы — не npm)
- `pages/`      — роутные компоненты; `stores/` — Zustand (глобальное состояние)
- `hooks/`      — custom hooks; `types/` — TypeScript types; `constants/` — константы (scopusFilters.ts)
- `test/setup.ts` — jest-dom matchers (setupFiles в vite.config.ts)

## Key stores
- `articleStore`  — articles, pagination, `searchMode` ('catalog'|'scopus'), `currentKeyword`; `setSearchMode()` → автоматически вызывает `historyStore.resetFilters()`
- `historyStore`  — search history + `historyFilters` (shared фильтры) + `resetFilters()` → `{}`
- `statsStore`    — catalog stats (by_year, by_country, by_doc_type); загружается в `App.tsx` на старте
- `authStore` — JWT/user; `quotaStore` — Scopus weekly quota

## Dual-mode filtering (filtering-2, merged 2026-06-25)
**Catalog**: изменение фильтра → `setPage(1)` + `fetchArticles()` немедленно (год debounce 400 мс).
**Scopus**: изменение фильтра → amber-badge «Filters changed»; ре-фетч только при следующем явном поиске; badge сбрасывается через `useEffect(() => setFiltersChanged(false), [liveResults])`.
Источники опций: catalog → `statsStore`; scopus → `SCOPUS_DOC_TYPES`/`SCOPUS_COUNTRIES` (constants/scopusFilters.ts).
`ArticleFilters.tsx` экспортирует `ArticleFiltersSidebar` (desktop) и `ArticleFiltersMobile` (Sheet); внутри — `MultiSelectCombobox` (Popover+Command) и `FiltersContent` (вся логика).
`historyFilters` — единственный источник истины; `fetchArticles()`/`searchScopusLive()` читают через `useHistoryStore.getState()` в момент вызова.

## Tests (co-location pattern: тест рядом с источником)
Unit: `src/**/*.test.{ts,tsx}` | Integration: `*.integration.test.*`
Total (main, 2026-06-25): **169** тестов, все зелёные.
Vitest patterns (Checkbox mock, fake timers, vi.hoisted) — см. память [[feedback-vitest-testing-patterns]].

## CI: frontend-tests.yml (triggers: push main + feature, paths: frontend/**)
| Job | Command |
|---|---|
| `typecheck` | `npx tsc --noEmit` |
| `unit` | `npx vitest run --exclude 'src/**/*.integration.test.*' src/**/*.test.ts src/**/*.test.tsx` |
| `integration` | `npx vitest run src/components/articles/pagination.integration.test.tsx src/App.integration.test.tsx` |

Node.js: 22. `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true` — для actions runner, не для Node.

## Commands (from frontend/)
```bash
npm run test / test:watch / test:coverage / lint / build
```

## Build & conventions
- Tailwind v3 via PostCSS (NOT @tailwindcss/vite — это v4). vendor-charts chunk ~850 kB — ожидаемо.
- ESM only (`"type": "module"`). PascalCase компоненты `.tsx`, camelCase утилиты `.ts`.
- shadcn/ui в `components/ui/` — прямые правки разрешены (уже кастомизированы).
- **`Button` (и любой shadcn/ui компонент, используемый как `<PopoverTrigger asChild>`)** обязан быть обёрнут в `React.forwardRef` — иначе в React 18.3.1 Radix ref-chain обрывается, `isPositioned` остаётся `false`, Popover рендерится за экраном (`translate(0, -200%)`). Исправлено в commit `62228bd`.
- Тест-файлы: co-location, `*.test.tsx` (unit) / `*.integration.test.tsx` (integration).
