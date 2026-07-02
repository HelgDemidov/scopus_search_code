# Frontend context
# All paths relative to frontend/ unless stated otherwise.

## Stack
React 18 + TypeScript ~5.7 + Vite ^6.0 + Tailwind CSS 3 + shadcn/ui (Radix UI).
State: Zustand 5. HTTP: axios. Router: react-router-dom 7. Tests: Vitest 4 + Testing Library (jsdom).
Charts: recharts ^2.15.4. Forms: react-hook-form + zod. Toasts: sonner. Icons: lucide-react.
i18n: react-i18next 17 + i18next 26 + i18next-browser-languagedetector 8.

## src/ structure
- `api/` — HTTP clients; `components/` — UI (`components/ui/` = shadcn/ui, inline customized)
- `pages/` — роутные компоненты; `stores/` — Zustand; `hooks/` — custom hooks; `types/` — TS types
- `constants/` — scopusFilters.ts + labelTranslations.ts (переводы меток графиков)
- `locales/` — `en`/`ru`/`sr-Latn` translation.json (204 ключа); `i18n.ts` init; `i18next.d.ts` типы; `test/setup.ts` — jest-dom matchers

## Key stores
- `articleStore` — articles/pagination/`searchMode`('catalog'|'scopus')/`currentKeyword`/`resetKey`; `setSearchMode()` → `historyStore.resetFilters()`; `resetSearch()` → clears + инкрементирует `resetKey`
- `historyStore` — search history + `historyFilters` (shared фильтры) + `resetFilters()`
- `statsStore` — catalog stats; загружается в `App.tsx` на старте
- `dashboardStore` — /explore: `activeSelection` (cross-filter), `drawerDimension` (Sheet), `builderCards`
- `authStore`/`quotaStore`/`tokenStore` — JWT/user, Scopus weekly quota, изолированный in-memory держатель AT (разрывает circular dep `client.ts ↔ authStore`)

## Dual-mode filtering (filtering-2, merged 2026-06-25)
**Catalog**: фильтр → `setPage(1)` + `fetchArticles()` немедленно (год debounce 400мс). **Scopus**: фильтр → amber-badge «Filters changed», ре-фетч только при следующем явном поиске.
Источники опций: catalog → `statsStore`; scopus → `SCOPUS_DOC_TYPES`/`SCOPUS_COUNTRIES`. `ArticleFilters.tsx` экспортирует `ArticleFiltersSidebar`/`ArticleFiltersMobile`; `historyFilters` — единственный источник истины (читается через `useHistoryStore.getState()`).

## Tests (co-location pattern: тест рядом с источником)
Unit: `src/**/*.test.{ts,tsx}` | Integration: `*.integration.test.*`
Total (main, 2026-07-02): **418** тестов, все зелёные.
Vitest patterns (Checkbox mock, fake timers, vi.hoisted) — см. память [[feedback-vitest-testing-patterns]].
jsdom browser API mocks — см. память [[feedback-jsdom-browser-api-mocks]].

### Coverage (2026-06-26)
`vite.config.ts` → `coverage.include`: 12 файлов бизнес-логики (stores/articleStore|authStore|historyStore, hooks/usePagination, pages/HomePage|ForgotPassword|ResetPassword, api/articles, components/articles/ArticleFilters|ArticleList|PaginationBar|ScopusPaginationBar).
Threshold: `statements: 70` (фактическое: **76.54%**). Исключены: `components/ui/` (vendor), `components/charts/` (Recharts passthrough), `App.tsx` (v8 показывает 0% через vi.mock — ложный ноль), `main.tsx`.
CI: `integration` job считает coverage по всем 418 тестам. `frontend/coverage/` в `.gitignore`.

## CI: frontend-tests.yml (triggers: push main, paths: frontend/**)
Джобы: `typecheck` (tsc --noEmit), `lint` (ESLint --max-warnings 0 + npm audit --audit-level=high), `unit` (vitest, искл. `*.integration.test.*`), `integration` (vitest + coverage artifact), `build` (npm run build).
Node.js 22. **ESLint:** flat config `eslint.config.js` (ESLint 10 + typescript-eslint 8 + react-hooks 7 + react-refresh); shadcn/ui overrides — последний блок в файле (last block wins). `react-hooks/set-state-in-effect` disable-comment — **внутри** тела useEffect, перед первым setState.

## Commands (from frontend/)
```bash
npm run test / test:watch / test:coverage / lint / build
```

## Dark mode (feat/dark-mode, merged PR #33, 2026-06-28)
`ThemeContext.ts` → `ThemeProvider.tsx` (overlay fade 3500/400ms) → `useTheme.ts` → `ThemeToggle.tsx`. `StarFieldCanvas.tsx` — Canvas звёздное небо (400/150 звёзд desktop/mobile, MAX_METEORS=50, HiDPI, prefers-reduced-motion).
Фон `#0d1b2a`; поверхности (ChartCard/KpiTile/ChartTooltip) `#152236`. `useDimensionColors(dimension)` — theme-aware (dark → `darkDimmed` 900-shades). По умолчанию dark (первое посещение без localStorage). Логотип в Header → `articleStore.resetSearch()`.
`react-hooks/set-state-in-effect` — disable-comment **внутри** useEffect перед setState (ESLint flat config требует).

## /explore analytics dashboard (merged 2026-06-27; рефакторинг PR #42, 2026-07-02)
`ExplorePage` — collection mode: KpiRow (6 тайлов) → клик открывает `DimensionDrawer` (Sheet) с детальным видом. 6 старых стационарных чартов **отключены** в collection mode (компоненты не удалены, просто не рендерятся — дублировали DimensionDrawer); в personal mode (история пользователя) 4 из них по-прежнему используются.
`DimensionDrawer`: `year` — area, `open_access`/`doc_type` — donut, `country`/`journal`/`author` — horizontal bar (top-15, ranked-цвет).
`chartColors.ts`: `getRankedBarColor()` — верхний бар чистый `base`, нижние смещаются к белому (dark-тема) / чёрному (light-тема), контрастнее фона своей темы, не выцветают в него. `TAXONOMY_PALETTE`/`getTaxonomyColor()` — 12-цветная качественная палитра для `doc_type` donut (ranked-fade неразличим на смежных дугах одного круга).
Cross-filter V1 — визуальный: Cell fill из `dashboardStore.activeSelection` (base/selected/dimmed); серверной фильтрации нет. `CHART_TYPE_LABELS` — в `chartColors.ts`, не в `DynamicChart` (react-refresh/only-export-components).

## Auth pages (auth-refactoring, merged 2026-06-26)
- `ForgotPasswordPage` (`/forgot-password`) — email → `POST /auth/password-reset`; всегда показывает "Check your email" (не раскрывает наличие аккаунта)
- `ResetPasswordPage` (`/reset-password?token=...`) — `confirmPasswordReset(token, newPassword)` → `POST /auth/password-reset/confirm`; 422 → inline error + ссылка "Request a new link"; success → `toast.success` + navigate `/auth`
- **`noValidate` на `<form>` — обязателен** когда используется `<input type="email">` с react-hook-form + Zod: без него jsdom's HTML5 validation перехватывает `submit`, Zod-валидатор никогда не вызывается
- AT больше не в localStorage; `client.ts` читает через `getToken()` из `tokenStore.ts`
- `AuthPage` (`/auth`) — вертикальный нав (`flex-row gap-5`, Register сверху / Sign in снизу, `w-28`), форма справа (`flex-1`); card-surface `max-w-md`. Разделитель i18n-ключ `auth.divider` (EN "or" / RU "или" / sr-Latn "ili").

## i18n (PR #34 EN/RU + PR #35 sr-Latn, merged 2026-06-28)
EN/РУ/CG (sr-Latn) переключатель в Header (`LanguageSwitcher.tsx`, Radix `DropdownMenu`), выбор — в `localStorage` (`i18n_lang`). Локали: `locales/{en,ru,sr-Latn}` (204 ключа); init — `src/i18n.ts`, типизация — `i18next.d.ts`.
Плюральные формы: RU `_one/_few/_many/_other`; sr-Latn `_one/_few/_other`; EN `_one/_other` (CLDR). KPI — `getKpiLabel()` в `KpiRow.tsx`.
Переводы меток графиков — `constants/labelTranslations.ts`: `getLabelMaps(lang)` → `{country, doc_type, oa}` для RU/sr-Latn, `null` для EN; используется в ChartTooltip/DimensionDrawer/*Chart/ArticleFilters.
CI lint job проверяет паритет ключей EN↔RU↔SR-LATN. Фильтры: `MultiSelectCombobox` — `getDisplayLabel?`. **"Open Access"** не переводится; **"Closed Access"** → "Закрытый доступ"/"Zatvoreni pristup".

## SEO & Google Analytics (2026-06-29)
`frontend/public/`: `sitemap.xml` (/, /explore), `robots.txt` (Allow all, block AI crawlers), `google4ec5affa61728a9a.html` (Search Console). `index.html`: Open Graph, Twitter card, canonical, robots meta, sitemap link.
`vercel.json` — явные статические маршруты (`sitemap.xml`, `robots.txt`, `/google:path*`) перед catch-all `/(.*) → /index.html` (без них catch-all может перехватить статику).
GA4 (`G-RZW7LRD02L`): `gtag.js` в `index.html` через `%VITE_GA_MEASUREMENT_ID%` (Vite env), `send_page_view:false` → page_view в `RootLayout` через `useLocation`+`useEffect`. Типы: `src/types/gtag.d.ts`. CSP: добавлены `googletagmanager.com` + `google-analytics.com`. Env var: `VITE_GA_MEASUREMENT_ID` (Vercel Production+Preview + `.env.local`). **Не использовать react-ga4** — лишняя зависимость, gtag.js напрямую.

## Build & conventions
- Tailwind v3 via PostCSS (NOT @tailwindcss/vite — это v4); vendor-charts chunk ~432 kB gzip ~115 kB — ожидаемо (Recharts). ESM only (`"type": "module"`); PascalCase компоненты `.tsx`, camelCase утилиты `.ts`.
- shadcn/ui в `components/ui/` — прямые правки разрешены (уже кастомизированы).
- **`Button` (и любой shadcn/ui компонент, используемый как `<PopoverTrigger asChild>`)** обязан быть обёрнут в `React.forwardRef` — иначе в React 18.3.1 Radix ref-chain обрывается, `isPositioned` остаётся `false`, Popover рендерится за экраном (`translate(0, -200%)`). Исправлено в commit `62228bd`.
- Тест-файлы: co-location, `*.test.tsx` (unit) / `*.integration.test.tsx` (integration).
