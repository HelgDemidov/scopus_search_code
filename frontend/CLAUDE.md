# Frontend context
# All paths relative to frontend/ unless stated otherwise.

## Stack
React 18 + TypeScript ~5.7 + Vite ^6.0 + Tailwind CSS 3 + shadcn/ui (Radix UI).
State: Zustand 5. HTTP: axios. Router: react-router-dom 7. Tests: Vitest 4 + Testing Library (jsdom).
Charts: recharts ^2.15.4. Forms: react-hook-form + zod. Toasts: sonner. Icons: lucide-react.
i18n: react-i18next 17 + i18next 26 + i18next-browser-languagedetector 8.

## src/ structure
- `api/`        — HTTP clients; все вызовы сюда, не в компоненты
- `components/` — UI; `components/ui/` — shadcn/ui (inline, кастомизированы — не npm)
- `pages/`      — роутные компоненты; `stores/` — Zustand (глобальное состояние)
- `hooks/`      — custom hooks; `types/` — TypeScript types; `constants/` — scopusFilters.ts + labelTranslations.ts (переводы меток графиков)
- `locales/`    — `en/translation.json` + `ru/translation.json` + `sr-Latn/translation.json` (204 ключа); `i18n.ts` — инициализация; `i18next.d.ts` — строгие типы
- `test/setup.ts` — jest-dom matchers (setupFiles в vite.config.ts)

## Key stores
- `articleStore`  — articles, pagination, `searchMode` ('catalog'|'scopus'), `currentKeyword`, `resetKey`; `setSearchMode()` → автоматически вызывает `historyStore.resetFilters()`; `resetSearch()` → очищает results/filters/currentKeyword, инкрементирует `resetKey` (используется для ремаунта SearchBar)
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
Total (main, 2026-06-29): **370** тестов, все зелёные.
Vitest patterns (Checkbox mock, fake timers, vi.hoisted) — см. память [[feedback-vitest-testing-patterns]].
jsdom browser API mocks — см. память [[feedback-jsdom-browser-api-mocks]].

### Coverage (2026-06-26)
`vite.config.ts` → `coverage.include`: 12 файлов бизнес-логики (stores/articleStore|authStore|historyStore,
hooks/usePagination, pages/HomePage|ForgotPassword|ResetPassword, api/articles,
components/articles/ArticleFilters|ArticleList|PaginationBar|ScopusPaginationBar).
Threshold: `statements: 70` (фактическое: **76.54%** statements).
Исключены: `components/ui/` (vendor-код), `components/charts/` (Recharts passthrough),
`App.tsx` (v8 показывает 0% через vi.mock в интеграционном тесте — ложный ноль), `main.tsx`.
CI: шаг `Collect coverage (all tests)` в job `integration` запускает все 370 тестов с `--coverage`.
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

## Dark mode (feat/dark-mode, merged PR #33, 2026-06-28)
`ThemeContext.ts` → `ThemeProvider.tsx` (context + overlay fade 3500ms/400ms) → `useTheme.ts` → `ThemeToggle.tsx` (Moon/Sun, aria-label).
`StarFieldCanvas.tsx` — Canvas: 3-tier stars (400 desktop/150 mobile), per-star twinkling (индивидуальные `twinklePeriod`/`twinklePhase`), MAX_METEORS=50, длина метеора 10–70% ширины (5% достигают 70%), 15/60fps, HiDPI, prefers-reduced-motion.
Фон страницы `#0d1b2a`; поверхности (ChartCard/KpiTile/ChartTooltip) `#152236` (`dark:bg-[#152236]`).
`useDimensionColors(dimension)` — theme-aware hook: в dark возвращает `darkDimmed` (900-shades) вместо `dimmed` (200-shades); без ThemeProvider → всегда light (нулевая регрессия тестов).
По умолчанию тёмный режим (первое посещение без localStorage → dark). Логотип в Header вызывает `articleStore.resetSearch()`.
`react-hooks/set-state-in-effect` — disable comment **внутри** тела useEffect перед setState (ESLint flat config это требует).

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
- `AuthPage` (`/auth`) — вертикальный нав (`flex-row gap-5`, Register сверху / Sign in снизу, `w-28`), форма справа (`flex-1`); card-surface `max-w-md`. Разделитель i18n-ключ `auth.divider` (EN "or" / RU "или" / sr-Latn "ili").

## i18n (PR #34 EN/RU + PR #35 sr-Latn, merged 2026-06-28)
EN / РУ / CG (sr-Latn) переключатель в Header (`LanguageSwitcher.tsx` — Radix UI `DropdownMenu`, dark mode совместим), выбор сохраняется в `localStorage` (ключ `i18n_lang`).
Локали: `locales/en`, `locales/ru`, `locales/sr-Latn` (204 ключа, черногорский ijekavist flavour). Инициализация — `src/i18n.ts`; строгая типизация через `i18next.d.ts`.
Плюральные формы: RU `_one/_few/_many/_other`; sr-Latn `_one/_few/_other`; EN `_one/_other` (CLDR).
Переводы меток графиков — `constants/labelTranslations.ts`: `getLabelMaps(lang): LangMaps | null` возвращает `{country, doc_type, oa}` для RU и sr-Latn, `null` для EN. Все 6 компонентов (ChartTooltip, DimensionDrawer, OpenAccessChart, DocumentTypesChart, TopCountriesChart, ArticleFilters) используют `getLabelMaps`.
CI lint job проверяет паритет ключей EN ↔ RU ↔ SR-LATN (inline Node.js скрипт в `frontend-tests.yml`, исключает `_few/_many`).
KPI плюральные формы: `getKpiLabel(dim, count, t)` switch-функция в `KpiRow.tsx`.
Фильтры: `MultiSelectCombobox` принимает `getDisplayLabel?: (opt: string) => string` — значения хранятся в EN, отображаются по-русски/черногорски.
**"Open Access"** не переводится. **"Closed Access"** → "Закрытый доступ" / "Zatvoreni pristup".

## SEO & Google Analytics (2026-06-29)
`frontend/public/`: `sitemap.xml` (/, /explore), `robots.txt` (Allow all, block AI crawlers), `google4ec5affa61728a9a.html` (Search Console). `index.html`: Open Graph, Twitter card, canonical, robots meta, sitemap link.
`vercel.json` — явные статические маршруты (`sitemap.xml`, `robots.txt`, `/google:path*`) перед catch-all `/(.*) → /index.html` (без них catch-all может перехватить статику).
GA4 (`G-RZW7LRD02L`): `gtag.js` в `index.html` через `%VITE_GA_MEASUREMENT_ID%` (Vite env), `send_page_view:false` → page_view в `RootLayout` через `useLocation`+`useEffect`. Типы: `src/types/gtag.d.ts` (`window.gtag?`, `window.dataLayer?` — опциональны). CSP: добавлены `googletagmanager.com` + `google-analytics.com`. Env var: `VITE_GA_MEASUREMENT_ID` (Vercel Production+Preview + `.env.local`). **Не использовать react-ga4** — лишняя зависимость, gtag.js напрямую.

## Build & conventions
- Tailwind v3 via PostCSS (NOT @tailwindcss/vite — это v4). vendor-charts chunk ~432 kB gzip ~115 kB — ожидаемо (Recharts).
- ESM only (`"type": "module"`). PascalCase компоненты `.tsx`, camelCase утилиты `.ts`.
- shadcn/ui в `components/ui/` — прямые правки разрешены (уже кастомизированы).
- **`Button` (и любой shadcn/ui компонент, используемый как `<PopoverTrigger asChild>`)** обязан быть обёрнут в `React.forwardRef` — иначе в React 18.3.1 Radix ref-chain обрывается, `isPositioned` остаётся `false`, Popover рендерится за экраном (`translate(0, -200%)`). Исправлено в commit `62228bd`.
- Тест-файлы: co-location, `*.test.tsx` (unit) / `*.integration.test.tsx` (integration).
