# Frontend context
# All paths relative to frontend/ unless stated otherwise.

## Stack
React 18 + TypeScript ~5.7 + Vite ^6.0 + Tailwind CSS 3 + shadcn/ui (Radix UI).
State: Zustand 5. HTTP: axios. Router: react-router-dom 7. Tests: Vitest 4 + Testing Library (jsdom).
Charts: recharts ^2.15.4. Forms: react-hook-form + zod. Toasts: sonner. Icons: lucide-react.

## src/ structure
- `api/`        — HTTP clients; все вызовы сюда, не в компоненты
- `components/` — UI; `components/ui/` — shadcn/ui (inline, кастомизированы — не npm)
- `pages/`      — роутные компоненты; `stores/` — Zustand (глобальное состояние)
- `hooks/`      — custom hooks; `types/` — TypeScript types; `constants/` — константы (scopusFilters.ts)
- `test/setup.ts` — jest-dom matchers (setupFiles в vite.config.ts)

## Key stores
- `articleStore`  — articles, pagination, `searchMode` ('catalog'|'scopus'), `currentKeyword`; `setSearchMode()` → автоматически вызывает `historyStore.resetFilters()`
- `historyStore`  — search history + `historyFilters` (shared фильтры) + `resetFilters()` → `{}`
- `statsStore`    — catalog stats (by_year, by_country, by_doc_type, top_keywords, totals); загружается в `App.tsx` на старте
- `dashboardStore` — состояние /explore: `activeSelection` (cross-filter), `drawerDimension` (Sheet), `builderCards` (Chart Builder)
- `authStore` — JWT/user; `quotaStore` — Scopus weekly quota
- `tokenStore`    — изолированный держатель AT (только in-memory, без зависимостей); разрывает circular dep `client.ts ↔ authStore`

## Dual-mode filtering (filtering-2, merged 2026-06-25)
**Catalog**: изменение фильтра → `setPage(1)` + `fetchArticles()` немедленно (год debounce 400 мс).
**Scopus**: изменение фильтра → amber-badge «Filters changed»; ре-фетч только при следующем явном поиске; badge сбрасывается через `useEffect(() => setFiltersChanged(false), [liveResults])`.
Источники опций: catalog → `statsStore`; scopus → `SCOPUS_DOC_TYPES`/`SCOPUS_COUNTRIES` (constants/scopusFilters.ts).
`ArticleFilters.tsx` экспортирует `ArticleFiltersSidebar` (desktop) и `ArticleFiltersMobile` (Sheet); внутри — `MultiSelectCombobox` (Popover+Command) и `FiltersContent` (вся логика).
`historyFilters` — единственный источник истины; `fetchArticles()`/`searchScopusLive()` читают через `useHistoryStore.getState()` в момент вызова.

## Tests (co-location pattern: тест рядом с источником)
Unit: `src/**/*.test.{ts,tsx}` | Integration: `*.integration.test.*`
Total (main, 2026-06-27): **270** тестов, все зелёные.
Vitest patterns (Checkbox mock, fake timers, vi.hoisted) — см. память [[feedback-vitest-testing-patterns]].

### Coverage (2026-06-26)
`vite.config.ts` → `coverage.include`: 12 файлов бизнес-логики (stores/articleStore|authStore|historyStore,
hooks/usePagination, pages/HomePage|ForgotPassword|ResetPassword, api/articles,
components/articles/ArticleFilters|ArticleList|PaginationBar|ScopusPaginationBar).
Threshold: `statements: 70` (фактическое: **76.54%** statements).
Исключены: `components/ui/` (vendor-код), `components/charts/` (Recharts passthrough),
`App.tsx` (v8 показывает 0% через vi.mock в интеграционном тесте — ложный ноль), `main.tsx`.
CI: шаг `Collect coverage (all tests)` в job `integration` запускает все 181 тест с `--coverage`.
`frontend/coverage/` добавлен в `.gitignore`.

## CI: frontend-tests.yml (triggers: push main, paths: frontend/**)
| Job | Что делает |
|---|---|
| `typecheck` | `npx tsc --noEmit` — полная проверка типов |
| `lint` | `npm run lint` (ESLint 10 flat config, --max-warnings 0) + `npm audit --audit-level=high` |
| `unit` | `npx vitest run` unit-тесты (исключает *.integration.test.*) |
| `integration` | `npx vitest run` integration + coverage artifact |
| `build` | `npm run build` — Vite production bundle (ловит что tsc пропускает) |

Node.js: 22. `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true` — для actions runner, не для Node.
**ESLint:** flat config `eslint.config.js` (ESLint 10 + typescript-eslint 8 + react-hooks 7 + react-refresh). shadcn/ui overrides в отдельном блоке в конце файла (last block wins). `react-hooks/set-state-in-effect` disable-comments — **внутри** тела useEffect, перед первым setState.

## Commands (from frontend/)
```bash
npm run test / test:watch / test:coverage / lint / build
```

## /explore analytics dashboard (interactive-charts, merged 2026-06-27)
`ExplorePage` — collection mode: KpiRow (6 тайлов) → DimensionDrawer (Sheet) → PublicationsByYear → 2×2 grid → ThematicAreas → ChartBuilderPanel.
`components/charts/`: ChartCard, ChartTooltip, chartColors (6 цветовых профилей + CHART_TYPE_LABELS), DynamicChart (5 типов).
`components/explore/`: KpiTile, KpiRow, DimensionDrawer, ChartBuilderPanel.
Cross-filter V1 — визуальный: Cell fill из dashboardStore.activeSelection (base/selected/dimmed); серверной фильтрации нет.
`CHART_TYPE_LABELS` живёт в `chartColors.ts` (не в DynamicChart) — требование react-refresh/only-export-components.

## Auth pages (auth-refactoring, merged 2026-06-26)
- `ForgotPasswordPage` (`/forgot-password`) — email → `POST /auth/password-reset`; всегда показывает "Check your email" (не раскрывает наличие аккаунта)
- `ResetPasswordPage` (`/reset-password?token=...`) — `confirmPasswordReset(token, newPassword)` → `POST /auth/password-reset/confirm`; 422 → inline error + ссылка "Request a new link"; success → `toast.success` + navigate `/auth`
- **`noValidate` на `<form>` — обязателен** когда используется `<input type="email">` с react-hook-form + Zod: без него jsdom's HTML5 validation перехватывает `submit`, Zod-валидатор никогда не вызывается
- AT больше не в localStorage; `client.ts` читает через `getToken()` из `tokenStore.ts`

## Build & conventions
- Tailwind v3 via PostCSS (NOT @tailwindcss/vite — это v4). vendor-charts chunk ~432 kB gzip ~115 kB — ожидаемо (Recharts).
- ESM only (`"type": "module"`). PascalCase компоненты `.tsx`, camelCase утилиты `.ts`.
- shadcn/ui в `components/ui/` — прямые правки разрешены (уже кастомизированы).
- **`Button` (и любой shadcn/ui компонент, используемый как `<PopoverTrigger asChild>`)** обязан быть обёрнут в `React.forwardRef` — иначе в React 18.3.1 Radix ref-chain обрывается, `isPositioned` остаётся `false`, Popover рендерится за экраном (`translate(0, -200%)`). Исправлено в commit `62228bd`.
- Тест-файлы: co-location, `*.test.tsx` (unit) / `*.integration.test.tsx` (integration).
