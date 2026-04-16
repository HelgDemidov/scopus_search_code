## Три плана реализации фронтенда

***

## План А — Мои коммиты (10 блоков)

Все файлы создаются в `frontend/` внутри ветки `web-frontend-development`- необходимо создать эту папку в рамках первого коммита Блока 1. Каждый блок — один коммит с атомарными файлами. 

### Блок 1 — Инициализация проекта (скаффолдинг)
**Файлы:** `frontend/package.json`, `frontend/vite.config.ts`, `frontend/tsconfig.json`, `frontend/index.html`, `frontend/.gitignore`, `frontend/vercel.json`

Создаю всю базовую конфигурацию проекта: Vite + React + TypeScript, Tailwind v3 (PostCSS-пайплайн), зависимости зафиксированы по ТЗ §1 и §7.1. `vercel.json` с SPA-rewrite по §7.1. `.gitignore` включает `node_modules`, `.env.local`, `.env.production`.

> **⚠️ Ждёт твоего действия Д-1** перед запуском: `npm install` нельзя выполнить удалённо.

***

### Блок 2 — Конфигурационные файлы стека
**Файлы:** `frontend/tailwind.config.ts`, `frontend/postcss.config.js`, `frontend/src/index.css`

`tailwind.config.ts` с полным v3-конфигом: `content[]`, `darkMode: 'class'`, `theme.extend` с `fontFamily`, `colors` (brand, surface, chart-*), `safelist` для Tremor по §7.2.3–§7.2.5.  `postcss.config.js` в ESM-синтаксисе (`export default`) по §8.

***

### Блок 3 — Типы, константы и API-клиент
**Файлы:** `frontend/src/types/api.ts`, `frontend/src/constants/chartColors.ts`, `frontend/src/api/client.ts`, `frontend/src/api/articles.ts`, `frontend/src/api/auth.ts`, `frontend/src/api/stats.ts`, `frontend/src/api/users.ts`

- `api.ts` — все интерфейсы: `ArticleResponse`, `PaginatedArticleResponse`, `StatsResponse`, `UserResponse`, `ArticleFilters` по §2.3 и §4.1
- `client.ts` — единственный axios-инстанс, request interceptor (Bearer token), response interceptor (401 → logout) по §2.4
- `chartColors.ts` — `CHART_COLORS`, `CHART_HEX`, `CHART_COLORS_DARK` по §7.2.5
- API-функции — `getArticles`, `findArticles`, `getStats`, `login` (URLSearchParams), `register`, `getMe` по §2.1–§2.2

***

### Блок 4 — Zustand stores
**Файлы:** `frontend/src/stores/authStore.ts`, `frontend/src/stores/articleStore.ts`, `frontend/src/stores/statsStore.ts`

- `authStore` — `token`, `user` (с `created_at`, `username | null`), `isAuthenticated`, `setToken`, `fetchUser`, `logout` по §4.3
- `articleStore` — полный интерфейс `ArticleStore` из §4.1: `articles`, `filters: ArticleFilters`, `sortBy`, `liveResults`, `scopusQuota`; **без** `stats`/`fetchStats`
- `statsStore` — только `stats`, `isLoading`, `error`, `fetchStats` по §4.2

***

### Блок 5 — Хуки и утилиты
**Файлы:** `frontend/src/hooks/usePagination.ts`

Хук `usePagination(total, page, size)` по §4.1: вычисляет `totalPages`, диапазон номеров страниц с ellipsis, флаги `hasPrev`/`hasNext`.

***

### Блок 6 — Layout-компоненты (Header, PrivateRoute, App.tsx, Router)
**Файлы:** `frontend/src/components/layout/Header.tsx`, `frontend/src/components/layout/PrivateRoute.tsx`, `frontend/src/App.tsx`, `frontend/src/main.tsx`

- `Header.tsx` — анонимный и авторизованный варианты по §6; `displayName = username ?? email.split('@')[0]`; shadcn `<NavigationMenu>` + `<DropdownMenu>`
- `PrivateRoute.tsx` — читает `isAuthenticated` из `authStore`, редиректит на `/auth`
- `App.tsx` — `createBrowserRouter` с маршрутами по §3; hydration токена из `localStorage` с комментарием «без немедленной валидации» по §4.3
- `main.tsx` — точка входа с `<RouterProvider>`

***

### Блок 7 — Компоненты статей (ArticleCard, ArticleList, ArticleFilters, ScopusQuotaBadge)
**Файлы:** `frontend/src/components/articles/ArticleCard.tsx`, `frontend/src/components/articles/ArticleList.tsx`, `frontend/src/components/articles/ArticleFilters.tsx`, `frontend/src/components/articles/ScopusQuotaBadge.tsx`

- `ArticleCard.tsx` — все поля по §4.1 (таблица карточки): DOI-ссылка, badges, Tailwind-разметка по §7.2.6
- `ArticleList.tsx` — сетка `grid-cols-2`, skeleton при загрузке, empty state, сортировка + подсказка «Sorted within current page» по §4.1
- `ArticleFilters.tsx` — sidebar с чекбоксами, toggle, popover+command; данные из `useStatsStore().stats` по §4.1 (Б-6); `<Sheet>` для мобильного
- `ScopusQuotaBadge.tsx` — badge с `remaining/limit` из `scopusQuota`

***

### Блок 8 — Страницы
**Файлы:** `frontend/src/pages/HomePage.tsx`, `frontend/src/pages/ExplorePage.tsx`, `frontend/src/pages/AuthPage.tsx`, `frontend/src/pages/OAuthCallback.tsx`, `frontend/src/pages/ProfilePage.tsx`

- `HomePage.tsx` — hero, режимы анонима/авторизованного, `usePagination`, сортировка
- `ExplorePage.tsx` — KPI-карточки с `useCountUp`, подключение всех chart-компонентов, CTA-баннер
- `AuthPage.tsx` — shadcn `<Tabs>`, Sign In (URLSearchParams по §4.3), Create Account (JSON + автологин через URLSearchParams), кнопка Google → `window.location.href`; React Hook Form + Zod-схемы
- `OAuthCallback.tsx` — парсит `?token=` из URL → `setToken` → `fetchUser` → `navigate('/')` по §4.3 Вариант A
- `ProfilePage.tsx` — данные из `GET /users/me`, placeholder «Coming soon» для истории поиска, кнопка Sign Out

***

### Блок 9 — Chart-компоненты (6 штук для `/explore`)
**Файлы:** `frontend/src/components/charts/PublicationsByYearChart.tsx`, `TopJournalsChart.tsx`, `OpenAccessDonut.tsx`, `TopCountriesChart.tsx`, `DocumentTypesChart.tsx`, `TopKeywordsChart.tsx`

Каждый компонент — обёртка Tremor v3 (`<LineChart>`, `<BarChart>`, `<DonutChart>`) с:
- `index="label"`, `categories={["count"]}`
- `colors={[CHART_COLOR_PRIMARY]}` (именованные строки из `chartColors.ts`)
- skeleton-заглушка при `isLoading` через shadcn `<Skeleton>` по §4.2

***

### Блок 10 — Бэкенд: патч `auth.py` под Вариант A (OAuth redirect)
**Файлы:** `app/routers/auth.py` (изменение существующего файла)

Модификация `google_callback`: вместо `JSONResponse({access_token, token_type})` → `RedirectResponse(url=f"{FRONTEND_URL}/auth/callback?token={jwt}")` по §4.3. Читает `FRONTEND_URL` из переменных среды. Это единственный коммит в серверный код.

***

## План Б — Твои ручные действия (10 шагов)

Действия, которые невозможно выполнить через GitHub API. Перечислены в логическом порядке:

| # | Действие | Когда | Где |
|---|---|---|---|
| **Д-1** | `git pull` + `cd frontend && npm install` | После Блока 1 | Локальный терминал |
| **Д-2** | `npx shadcn@latest init` (base color = **slate**, CSS variables = **yes**) | После Д-1 | `frontend/` в терминале |
| **Д-3** | Добавить shadcn-компоненты: `npx shadcn@latest add card badge button input tabs sheet skeleton navigation-menu dropdown-menu checkbox switch pagination popover command sonner` | После Д-2 | `frontend/` в терминале |
| **Д-4** | Создать `frontend/.env.local` с `VITE_API_BASE_URL=http://localhost:8000` | После Д-1 | Любой редактор, файл в `.gitignore` |
| **Д-5** | Добавить `FRONTEND_URL=http://localhost:5173` в корневой `.env` бэкенда (для локального тестирования OAuth redirect flow) | После Д-1 | Корневой `.env` проекта |
| **Д-6** | В Railway добавить переменную `FRONTEND_URL=https://<project>.vercel.app` | Перед первым деплоем | Railway Dashboard → Variables |
| **Д-7** | Создать Vercel-проект: импортировать репо, указать **Root Directory = `frontend`**, добавить `VITE_API_BASE_URL=https://<railway-url>` в Environment Variables | После слияния в `main` | [vercel.com](https://vercel.com) |
| **Д-8** | В Google OAuth Console: добавить Vercel-URL в **Authorized JavaScript origins** и Railway-callback в **Authorized redirect URIs** (чеклист §7.1) | После Д-7 | [console.cloud.google.com](https://console.cloud.google.com) |
| **Д-9** | В Railway добавить `ALLOWED_ORIGINS=https://<project>.vercel.app` для CORS бэкенда (чеклист §7.1) | После Д-7 | Railway Dashboard → Variables |
| **Д-10** | Финальная проверка: открыть `https://<project>.vercel.app`, проверить `/explore`, Google OAuth и логин через email | После Д-9 | Браузер |

***

## План В — Общее расписание (последовательность)

```
ТЫ                              Я (коммиты)
──────────────────────────────────────────────────────────────────
                                ┌─ Блок 1: Инициализация (package.json,
                                │  vite.config.ts, index.html, vercel.json)
                                └─ Блок 2: Tailwind + PostCSS config
Д-1: git pull + npm install ───►
Д-2: npx shadcn@latest init ───►
Д-3: npx shadcn@latest add ... ►
Д-4: создать .env.local ────────►
                                ┌─ Блок 3: Типы + API-клиент
                                ├─ Блок 4: Zustand stores
                                └─ Блок 5: usePagination хук
                                ┌─ Блок 6: Layout (Header, PrivateRoute,
                                │  App.tsx, main.tsx)
                                ├─ Блок 7: Компоненты статей
                                ├─ Блок 8: Страницы (5 штук)
                                ├─ Блок 9: Chart-компоненты (6 штук)
                                └─ Блок 10: Патч auth.py (OAuth redirect)
Д-5: .env — FRONTEND_URL ──────►
git pull → npm run dev ─────────►  ← Локальная проверка
──────────────────────── [Gate: всё работает локально] ──────────────
merge web-frontend-development → main
Д-7: Создать Vercel-проект ─────►
Д-6: Railway FRONTEND_URL ──────►
Д-8: Google OAuth Console ──────►
Д-9: Railway ALLOWED_ORIGINS ───►
Д-10: Финальная проверка ───────►
```

**Жёсткие зависимости:**
- Д-1 (npm install) **должно** быть после Блоков 1–2 — иначе нет `package.json` для установки
- Д-2–Д-3 (shadcn init + add) **должно** быть до Блоков 6–9, потому что Блок 6 импортирует shadcn-компоненты из `src/components/ui/` — которые генерирует только CLI
- Блок 10 (патч `auth.py`) можно делать параллельно с Блоком 8, но в prod заработает только после Д-6 (FRONTEND_URL в Railway)
- Деплой-чеклист (Д-6–Д-9) — только после создания Vercel-проекта, конкретные URL неизвестны до Д-7
