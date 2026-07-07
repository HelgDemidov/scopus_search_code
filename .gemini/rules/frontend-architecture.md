---
name: frontend-architecture
description: Контекст архитектуры фронтенда Scopus Search (React, Vite, Tailwind, Zustand).
---

# Scopus Search — Frontend Context

## Stack
React 18 + TypeScript ~5.7 + Vite ^6.0 + Tailwind CSS 3 + shadcn/ui (Radix UI).
State: Zustand 5. HTTP: axios. Router: react-router-dom 7. Tests: Vitest 4 + Testing Library.
Charts: recharts ^2.15.4. Forms: react-hook-form + zod. Toasts: sonner. Icons: lucide-react.
i18n: react-i18next 17.

## src/ structure
- `api/` — HTTP clients; `components/` — UI (`components/ui/` = shadcn/ui)
- `pages/` — роутные компоненты; `stores/` — Zustand; `hooks/` — custom hooks; `types/`
- `constants/` — scopusFilters.ts + labelTranslations.ts
- `locales/` — `en`/`ru`/`sr-Latn` translation.json

## Key stores
- `articleStore` — articles/pagination/searchMode/currentKeyword.
- `historyStore` — search history + historyFilters (shared фильтры).
- `statsStore` — catalog stats; `dashboardStore` — /explore (activeSelection, builderCards).
- `authStore`/`quotaStore`/`tokenStore` — JWT/user, Scopus weekly quota, in-memory AT.

## Dual-mode filtering
- **Catalog**: фильтр → `setPage(1)` + `fetchArticles()` немедленно. 
- **Scopus**: фильтр → amber-badge «Filters changed», ре-фетч только при явном поиске. `historyFilters` — единственный источник истины.

## Tests
Unit: `src/**/*.test.{ts,tsx}` | Integration: `*.integration.test.*`. 635 тестов.
Coverage: 76.54%.

## Dark mode
Фон `#0c1927`. `StarFieldCanvas.tsx` — Canvas звёздное небо. По умолчанию dark.

## Error UX — "No Signal" + чёрная дыра
3-слойная архитектура ErrorBoundary. `ErrorPanel` со звездным небом и черной дырой (`StarFieldCanvas` + `blackHoleStore.ts`).

## /explore analytics dashboard
`ExplorePage` — collection mode & personal mode. `DimensionDrawer` (Sheet).
Cross-filter V1 — визуальный (Cell fill). 
Table Builder + Journal Landscape Scatter (2D pivot + ScatterChart).

## Auth pages
`noValidate` на `<form>` — обязателен для react-hook-form + Zod (чтобы избежать нативного HTML5 validation).
AT больше не в localStorage; `client.ts` читает через `getToken()` из `tokenStore.ts`.

## i18n
EN/РУ/CG (sr-Latn). Плюральные формы (RU _one/_few/_many/_other).

## SEO & Google Analytics
`sitemap.xml`, `robots.txt`. GA4 (`gtag.js` в `index.html`).

## Build & conventions
Tailwind v3 via PostCSS. ESM only. PascalCase компоненты `.tsx`, camelCase утилиты `.ts`.
shadcn/ui в `components/ui/` — прямые правки разрешены.
