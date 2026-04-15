# Frontend Technical Specification
## Scopus Research Search — Web Interface

**Версия:** 2.0
**Дата:** 2026-04-15
**Репозиторий:** `https://github.com/HelgDemidov/scopus_search_code`
**Рабочая ветка:** `web-frontend-development`
**Статус:** Draft — все основные решения приняты ✅

**История версий:**

| Версия | Дата | Изменения |
|---|---|---|
| 1.0 | 2026-04-15 | Первичная структура документа |
| 2.0 | 2026-04-15 | Зафиксирован стек React + Vite + Zustand + Tremor; заполнен раздел 7.1; обновлены разделы 1, 4.1, 7.2, 8, 9 |
| 2.1 | 2026-04-15 | §7.2 РЕШЕНО: цветовая схема, акцент, типографика, чарты (Tremor), плотность UI |

---

## 1. Контекст и цели

Scopus Research Search — веб-сервис для поиска и просмотра научных публикаций
через Scopus API. Бэкенд реализован на FastAPI + PostgreSQL (Supabase),
развёрнут на Railway. Фронтенд разрабатывается как отдельный SPA-клиент
(React + Vite), взаимодействующий с бэкендом исключительно через HTTP REST API.

**Технологический стек фронтенда (финальное решение):**
- **Фреймворк:** React 19 + Vite 6
- **Язык:** TypeScript 5
- **State management:** Zustand 5
- **UI-компоненты:** shadcn/ui (поверх Radix UI)
- **Стили:** Tailwind CSS v4
- **Графики:** Tremor (поверх Recharts — финальное решение, см. §7.2)
- **HTTP-клиент:** axios 1.x с interceptors
- **Роутинг:** React Router v7
- **Хостинг:** Vercel (бесплатный tier, поддомен `<project>.vercel.app`)

**Цели фронтенда:**
- Предоставить публичный browsing накопленной базы статей без регистрации
- Дать зарегистрированным пользователям доступ к live-поиску через Scopus API
- Показать аналитику по курируемой коллекции AI-публикаций на публичном
  дашборде `/explore`
- Обеспечить авторизацию через email/password и Google OAuth

---

## 2. API-контракт бэкенда

Все эндпоинты задокументированы в Swagger UI (`/docs`).
Base URL: `https://<railway-service-url>`

### 2.1 Публичные эндпоинты (без JWT)

| Метод | Путь | Назначение |
|---|---|---|
| `GET` | `/articles/` | Paginated список статей из БД; params: `page`, `size` |
| `GET` | `/articles/stats` | Агрегированная статистика по `is_seeded=TRUE` |
| `GET` | `/auth/google/login` | Редирект на Google OAuth consent screen |
| `GET` | `/auth/google/callback` | OAuth callback → возвращает `{access_token, token_type}` |
| `POST` | `/users/register` | Регистрация; body: `{username, email, password}` |
| `POST` | `/users/login` | Email/password логин; form-data → `{access_token, token_type}` |
| `POST` | `/users/password-reset-request` | Запрос сброса пароля по email |
| `GET` | `/health` | Health-check |

### 2.2 Приватные эндпоинты (требуют `Authorization: Bearer <jwt>`)

| Метод | Путь | Назначение |
|---|---|---|
| `GET` | `/articles/find` | Live-поиск в Scopus; params: `keyword`, `count` (1–25); заголовки ответа: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` |
| `GET` | `/users/me` | Профиль текущего пользователя → `{id, username, email}` |

### 2.3 Схемы ответов

**`ArticleResponse`**
```json
{
  "title": "string",
  "journal": "string | null",
  "author": "string | null",
  "publication_date": "YYYY-MM-DD",
  "doi": "string | null",
  "keyword": "string",
  "cited_by_count": "int | null",
  "document_type": "string | null",
  "open_access": "bool | null",
  "affiliation_country": "string | null"
}
```

**`PaginatedArticleResponse`**
```json
{ "articles": [ArticleResponse], "total": 1842 }
```

**`StatsResponse`**
```json
{
  "total_articles": 1842,
  "total_journals": 214,
  "total_countries": 47,
  "open_access_count": 623,
  "by_year":    [{"label": "2024", "count": 410}, ...],
  "by_journal": [{"label": "Nature Machine Intelligence", "count": 88}, ...],
  "by_country": [{"label": "United States", "count": 312}, ...],
  "by_doc_type":[{"label": "Article", "count": 1640}, ...],
  "top_keywords":[{"label": "large language models", "count": 380}, ...]
}
```

### 2.4 Авторизация и хранение токена

JWT-токен хранится в `localStorage` (ключ: `access_token`).
Все приватные запросы добавляют заголовок `Authorization: Bearer <token>`
через axios request interceptor — централизованно, без дублирования в компонентах.
Срок жизни токена: 30 минут (`ACCESS_TOKEN_EXPIRE_MINUTES=30`).
Фронтенд обрабатывает `401 Unauthorized` через axios response interceptor —
очищает токен из `localStorage` и Zustand-стора, перенаправляет на `/auth`.

---

## 3. Структура страниц и маршрутизация

```
/                 → Главная страница (публичная + расширенная для авторизованных)
/explore          → Аналитический дашборд коллекции (публичная)
/auth             → Страница авторизации (логин / регистрация)
/auth/callback    → Обработчик Google OAuth редиректа (технический маршрут)
/profile          → Личный кабинет (только для авторизованных, redirect иначе)
```

**Реализация:** React Router v7 с `createBrowserRouter`.
Защищённый маршрут `/profile` обёрнут в компонент `<PrivateRoute>`,
который читает токен из Zustand `authStore` и редиректит на `/auth` при отсутствии.

---

## 4. Страницы: детальное описание

### 4.1 Главная страница `/`

**Назначение:** точка входа и основной инструмент работы с сервисом.

#### Hero-секция
- Название проекта + одна строка описания («AI research publications
  from Scopus, curated and searchable»)
- Единая поисковая строка; placeholder: `Search AI research…`
- Поиск по базе (`GET /articles/`) работает для всех без авторизации

#### Режим анонимного пользователя
- Поисковая строка отправляет серверный запрос `GET /articles/?page&size`
  (серверная фильтрация через query-параметры бэкенда — клиент передаёт
  `keyword` как параметр запроса при наличии соответствующего эндпоинта
  либо использует client-side фильтрацию по полю `title` из загруженного
  набора; выбор уточняется при имплементации на основе реального API-ответа)
- Карточки статей (см. ниже)
- Sidebar фильтров (см. ниже)
- CTA-блок: «Sign in to search Scopus live»

#### Режим авторизованного пользователя
Дополнительно к режиму анонима:
- Блок **«Search Scopus Live»**: текстовое поле + кнопка «Search»
  → вызов `GET /articles/find?keyword=...&count=25`
- **Scopus Quota Badge** рядом с кнопкой:
  `Scopus quota: 4 821 / 20 000`
  Значения берутся из заголовков ответа `X-RateLimit-Remaining` /
  `X-RateLimit-Limit` последнего запроса к `/articles/find`.
  Обновляется при каждом live-поиске. До первого запроса — скрыт.

#### Управление состоянием страницы (Zustand)

Состояние главной страницы управляется через `useArticleStore`:

```typescript
interface ArticleStore {
  // Данные
  articles: ArticleResponse[];
  total: number;
  stats: StatsResponse | null;

  // Параметры запроса
  page: number;
  size: number;
  filters: ArticleFilters;
  sortBy: 'date' | 'citations';

  // Live-поиск (только для авторизованных)
  liveResults: ArticleResponse[];
  scopusQuota: { remaining: number; limit: number } | null;

  // UI-состояние
  isLoading: boolean;
  isLiveSearching: boolean;
  error: string | null;

  // Экшены
  fetchArticles: () => Promise<void>;
  fetchStats: () => Promise<void>;
  setFilters: (filters: Partial<ArticleFilters>) => void;
  setPage: (page: number) => void;
  searchScopusLive: (keyword: string) => Promise<void>;
}
```

#### Карточка статьи
Поля из `ArticleResponse`:

| Поле | Отображение |
|---|---|
| `title` | Заголовок; если `doi` не null — кликабельная ссылка `https://doi.org/{doi}` |
| `author` | Первый автор |
| `journal` | Курсивом |
| `publication_date` | Только год: `YYYY` |
| `cited_by_count` | Иконка цитирования + число |
| `document_type` | Badge (нейтральный цвет) |
| `open_access` | Badge «Open Access» (зелёный), показывается только если `true` |
| `affiliation_country` | Флаг + страна (опционально) |

**Реализация карточки:** shadcn/ui `<Card>` + `<Badge>` компоненты.

#### Sidebar фильтров
Данные для фильтров получаются из `GET /articles/stats` (поля
`by_year`, `by_doc_type`, `by_country`) при загрузке страницы.

| Фильтр | Тип элемента |
|---|---|
| Год публикации | Range slider или multi-select чекбоксы |
| Тип документа | Чекбоксы с счётчиком |
| Open Access only | Toggle |
| Страна аффиляции | Multi-select с поиском |

**Реализация:** shadcn/ui `<Checkbox>`, `<Switch>`, `<Popover>` + `<Command>`
для multi-select с поиском. На мобильном sidebar открывается через
shadcn/ui `<Sheet>` (drawer снизу).

#### Сортировка и пагинация
- Сортировка: по дате (убыв. по умолчанию), по цитированиям
- Пагинация: кнопки страниц + счётчик «Showing 1–10 of 1 842 results»
  (поле `total` из `PaginatedArticleResponse`)
- **Реализация пагинации:** shadcn/ui `<Pagination>` компонент

---

### 4.2 Аналитический дашборд `/explore`

**Назначение:** публичная витрина коллекции. Паттерн «public preview →
call to action». Все данные из одного запроса `GET /articles/stats`.

#### Headline stats (верхняя строка)
Три счётчика-карточки с анимацией при загрузке:
- **{total_articles}** Articles
- **{total_journals}** Journals
- **{total_countries}** Countries
- **{open_access_count / total_articles × 100}%** Open Access

**Реализация:** анимация счётчиков через `useCountUp` хук
(библиотека `react-countup` или кастомная реализация через `requestAnimationFrame`).

#### Графики

**Библиотека графиков: Tremor** (поверх Recharts, финальное решение — см. §7.2).

| Блок | Тип графика | Tremor-компонент | Данные |
|---|---|---|---|
| Publications by Year | Line chart | `<LineChart>` | `by_year` |
| Top 10 Journals | Horizontal bar | `<BarChart layout="vertical">` | `by_journal` |
| Open Access Ratio | Donut chart | `<DonutChart>` | `open_access_count` vs остальное |
| Top Countries | Bar chart | `<BarChart>` | `by_country` |
| Document Types | Donut | `<DonutChart>` | `by_doc_type` |
| Top Research Topics | Horizontal bar | `<BarChart layout="vertical">` | `top_keywords` |

**Общие требования к графикам:**
- Tremor автоматически обеспечивает адаптивность — `ResponsiveContainer` не нужен
- `showTooltip` включён на всех чартах
- `showLegend` для многорядных чартов
- Скелетон-заглушки при загрузке данных (shadcn `<Skeleton>`)
- Цветовая палитра чартов определена в `src/constants/chartColors.ts` (см. §7.2)

**Управление состоянием дашборда:** отдельный `useStatsStore` (Zustand):

```typescript
interface StatsStore {
  stats: StatsResponse | null;
  isLoading: boolean;
  error: string | null;
  fetchStats: () => Promise<void>;
}
```

Данные запрашиваются один раз при монтировании страницы.
Tremor-компоненты получают данные напрямую через prop `data` —
формат `{label, count}` передаётся через `index="label"` / `categories={["count"]}`.

#### CTA-блок
После графиков — баннер:
«Want to search Scopus live? [Create account] or [Sign in]»

---

### 4.3 Страница авторизации `/auth`

**Назначение:** единый экран логина и регистрации.

#### Структура
- Два таба: **Sign In** / **Create Account** (shadcn/ui `<Tabs>`)
- Разделитель `— or —`
- Кнопка **«Continue with Google»** (официальный стиль Google Identity
  Guidelines) → редирект на `GET /auth/google/login`

#### Таб «Sign In»
- Поле Email
- Поле Password (с toggle show/hide)
- Кнопка «Sign In» → `POST /users/login` (form-data: `username`, `password`)
- Ссылка «Forgot password?» → вызов `POST /users/password-reset-request`
  с показом inline-сообщения об успехе

#### Таб «Create Account»
- Поле Username
- Поле Email
- Поле Password + подтверждение пароля (client-side валидация совпадения)
- Кнопка «Create Account» → `POST /users/register`
- После успешной регистрации — автологин через `POST /users/login`
  и редирект на `/`

**Управление формами:** React Hook Form + Zod-схемы валидации.

```typescript
// Пример Zod-схемы для логина
const loginSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(1, 'Password is required'),
});
```

#### Обработка ошибок
- `409 Conflict` при регистрации → inline-сообщение «Email already registered»
- `401 Unauthorized` при логине → «Invalid email or password»
- Ошибки отображаются inline под соответствующим полем, не через toast

#### Google OAuth flow (технический маршрут `/auth/callback`)

```
[Пользователь] → кнопка «Continue with Google»
    → GET /auth/google/login (бэкенд)
    → 302 редирект на accounts.google.com
    → [Google OAuth consent]
    → 302 редирект на GET /auth/google/callback (бэкенд)
    → бэкенд возвращает {access_token, token_type}
    → 302 редирект на /auth/callback?token=<jwt> (фронтенд)
    → компонент <OAuthCallback> парсит token из URL
    → сохраняет в localStorage + Zustand authStore
    → navigate('/')
```

> **Примечание:** фактический формат редиректа бэкенда
> (query-параметр `token` или иной механизм) уточняется
> при интеграционном тестировании. Компонент `<OAuthCallback>`
> должен обрабатывать оба варианта: token в query-param и
> token в hash-fragment.

**Управление состоянием авторизации:** `useAuthStore` (Zustand):

```typescript
interface AuthStore {
  token: string | null;
  user: { id: number; username: string; email: string } | null;
  isAuthenticated: boolean;

  setToken: (token: string) => void;
  fetchUser: () => Promise<void>;
  logout: () => void;
}
```

`setToken` записывает токен в `localStorage` и стор одновременно.
`logout` очищает оба. При старте приложения `App.tsx` читает токен
из `localStorage` и инициализирует стор (hydration).

---

### 4.4 Страница профиля `/profile`

**Назначение:** личный кабинет авторизованного пользователя.
Неавторизованный пользователь редиректится на `/auth`.

Данные профиля: `GET /users/me` → `{id, username, email}`.

#### Блоки страницы

**Идентификация**
- Аватар (инициалы из `username`, без загрузки фото — API не поддерживает)
- Username, Email (только просмотр)
- Кнопка «Change Password» → вызов `POST /users/password-reset-request`
  с email текущего пользователя; показать inline-сообщение

**Search History** *(⚠️ отложено — требует доработки бэкенда)*
> Данный блок не реализуется в текущей версии фронтенда. Бэкенд не
> логирует поиски по пользователям. Реализация потребует новой таблицы
> `user_searches(user_id, keyword, found_count, searched_at)` и
> дополнения в `SearchService`. Блок зарезервирован в макете как
> placeholder «Coming soon».

**Logout**
- Кнопка «Sign Out» → `authStore.logout()` → очищает `localStorage`,
  сбрасывает Zustand-стор, редиректит на `/`

---

## 5. Общие UX-требования

### Состояния загрузки
- Skeleton-лоадеры для списка карточек (не спиннер)
  — shadcn/ui `<Skeleton>` компонент
- Skeleton для графиков на `/explore` (серые прямоугольники-заглушки
  той же высоты, что и реальный chart)
- Кнопки блокируются во время pending-запроса (disabled + индикатор)

### Пустые состояния
- Поиск без результатов: иллюстрация + текст «No articles found.
  Try a different keyword.»
- Коллекция пуста (база ещё не заполнена сидером): «The collection
  is being built. Check back soon.»

### Обработка ошибок сети
- `500` / сеть недоступна → toast «Server error. Please try again.»
  — shadcn/ui `<Sonner>` (toast-библиотека, интегрированная в shadcn)
- `401` на приватном эндпоинте → автологаут + редирект на `/auth`
  (через axios response interceptor, централизованно)

### Адаптивность
- Desktop-first; минимально поддерживаемая ширина: **1024px** для
  дашборда, **375px** для `/auth` и карточек
- Sidebar фильтров на мобильном сворачивается в drawer/sheet
  — shadcn/ui `<Sheet>`
- Все Tremor chart-компоненты адаптивны из коробки

---

## 6. Навигация и хедер

**Для анонима:** логотип/название + ссылки [Explore] [Sign In]
**Для авторизованного:** логотип + [Explore] + аватар/имя → dropdown
[Profile] [Sign Out]

**Реализация:**
- shadcn/ui `<NavigationMenu>` для desktop-навигации
- shadcn/ui `<DropdownMenu>` для user-меню
- `useAuthStore` из Zustand определяет, какой вариант хедера рендерить
- React Router `<Link>` для внутренних переходов

---

## 7. Фреймворк и визуальный стиль

### 7.1 Выбор фронтенд-фреймворка 

**Принятое решение:** React 19 + Vite 6 + TypeScript 5 (SPA).

#### Обоснование

Решение принято по результатам анализа по пяти критериям
(взвешенная скоринговая модель, оценка 9.6/10 из 10):

| Критерий | Вес | Обоснование |
|---|---|---|
| AI-покрытие + зрелость экосистемы | 25% | React — наибольший объём обучающих данных в LLM-моделях (~40% фронтенд-проектов, State of JS 2024); максимальное покрытие Stack Overflow / GitHub примеров |
| Инфографика vs легковесность | 25% | Tremor/Recharts из коробки; Vite bundle ~150–200 KB gzip; полная интерактивность без архитектурных компромиссов |
| Бесплатный хостинг + домен | 20% | Vercel: бесплатный tier навсегда, `<project>.vercel.app`, CDN в 100+ регионах, автодеплой из GitHub за 30 сек |
| Zero-cost + производительность | 15% | MIT-лицензии всего стека; Vite HMR < 50ms; React 19 concurrent rendering; Lighthouse 95+ |
| Совместимость с FastAPI / JWT / OAuth | 15% | Чистый SPA без мнений об авторизации; JWT в localStorage — стандартная практика; OAuth-редирект через бэкенд без конфликтов |

#### Финальный стек

| Слой | Технология | Версия | Лицензия |
|---|---|---|---|
| Фреймворк | React | 19 | MIT |
| Сборщик | Vite | 6 | MIT |
| Язык | TypeScript | 5 | Apache 2.0 |
| State management | Zustand | 5 | MIT |
| UI-компоненты | shadcn/ui | latest | MIT |
| Примитивы UI | Radix UI | latest | MIT |
| Стили | Tailwind CSS | v4 | MIT |
| Графики | Tremor | latest | Apache 2.0 |
| Роутинг | React Router | v7 | MIT |
| HTTP-клиент | axios | 1.x | MIT |
| Формы | React Hook Form | 7 | MIT |
| Валидация форм | Zod | 3 | MIT |
| Toast-уведомления | Sonner (shadcn) | latest | MIT |
| Хостинг | Vercel | — | Free tier |

#### Ключевые архитектурные решения, вытекающие из выбора стека

**State management (Zustand):**
- Минималистичный (нет boilerplate как в Redux)
- Три независимых стора: `useAuthStore`, `useArticleStore`, `useStatsStore`
- Сторы не связаны между собой напрямую — компоненты читают из нужных
- Hydration токена из `localStorage` при инициализации приложения в `App.tsx`

**HTTP-клиент (axios):**
- Единственный экземпляр axios создаётся в `src/api/client.ts`
- Request interceptor добавляет `Authorization: Bearer <token>` из `authStore`
- Response interceptor обрабатывает `401` → вызывает `authStore.logout()`

**Компонентная библиотека (shadcn/ui):**
- Компоненты копируются в проект (`src/components/ui/`) — не npm-зависимость
- Позволяет кастомизировать под любую дизайн-систему без версионных конфликтов
- Инициализация: `npx shadcn@latest init` при создании проекта

**Графики (Tremor):**
- Каждый chart-компонент выделен в отдельный файл в `src/components/charts/`
- Все используют Tremor's built-in responsiveness (нет необходимости в `<ResponsiveContainer>`)
- Скелетон-заглушки при `isLoading=true` (shadcn `<Skeleton>`)
- Цветовая палитра чартов централизована в `src/constants/chartColors.ts`
- Tremor использует собственную систему цветовых имён — кастомные цвета
  передаются через `customTooltipFormatter` или CSS переменные Tailwind

#### Структура репозитория (фронтенд)

```
frontend/
├── public/
├── src/
│   ├── api/
│   │   ├── client.ts           # axios instance + interceptors
│   │   ├── articles.ts         # GET /articles/, GET /articles/find
│   │   ├── auth.ts             # POST /users/login, register, etc.
│   │   ├── stats.ts            # GET /articles/stats
│   │   └── users.ts            # GET /users/me
│   ├── components/
│   │   ├── ui/                 # shadcn/ui компоненты (генерируются)
│   │   ├── charts/             # Tremor chart-компоненты дашборда
│   │   │   ├── PublicationsByYearChart.tsx
│   │   │   ├── TopJournalsChart.tsx
│   │   │   ├── OpenAccessDonut.tsx
│   │   │   ├── TopCountriesChart.tsx
│   │   │   ├── DocumentTypesChart.tsx
│   │   │   └── TopKeywordsChart.tsx
│   │   ├── layout/
│   │   │   ├── Header.tsx
│   │   │   └── PrivateRoute.tsx
│   │   └── articles/
│   │       ├── ArticleCard.tsx
│   │       ├── ArticleList.tsx
│   │       ├── ArticleFilters.tsx
│   │       └── ScopusQuotaBadge.tsx
│   ├── pages/
│   │   ├── HomePage.tsx
│   │   ├── ExplorePage.tsx
│   │   ├── AuthPage.tsx
│   │   ├── OAuthCallback.tsx   # /auth/callback — обработчик Google OAuth
│   │   └── ProfilePage.tsx
│   ├── stores/
│   │   ├── authStore.ts        # useAuthStore
│   │   ├── articleStore.ts     # useArticleStore
│   │   └── statsStore.ts       # useStatsStore
│   ├── types/
│   │   └── api.ts              # TypeScript-интерфейсы ArticleResponse, StatsResponse и др.
│   ├── constants/
│   │   └── chartColors.ts      # Централизованная палитра для Tremor-чартов
│   ├── App.tsx                 # Router + token hydration
│   └── main.tsx
├── index.html
├── vite.config.ts
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

#### Хостинг и деплой (Vercel)

- Фронтенд деплоится на Vercel отдельно от бэкенда (Railway)
- Автодеплой: каждый push в `web-frontend-development` → preview deployment;
  merge в `main` → production deployment
- Переменные окружения в Vercel: `VITE_API_BASE_URL=https://<railway-url>`
- CORS: бэкенд должен включать `https://<project>.vercel.app`
  в список разрешённых origins (добавить в Railway environment variables)
- `vercel.json` для SPA-маршрутизации (rewrite всех путей на `index.html`):

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

---

### 7.2 Визуальный дизайн 

#### 7.2.1 Цветовая схема и режимы

**Принятое решение:** светлая + тёмная темы с переключателем (toggle в хедере).

**Light-mode (основной режим):**

| Роль | Tailwind-класс | HEX | Контраст на белом |
|---|---|---|---|
| Акцентный / Primary | `blue-800` | `#1e40af` | **7.1:1 — AAA** ✅ |
| Текст основной | `slate-900` | `#0f172a` | — |
| Текст вторичный | `slate-600` | `#475569` | — |
| Текст третичный / мьютед | `slate-400` | `#94a3b8` | — |
| Поверхность страницы (bg) | `white` | `#ffffff` | — |
| Поверхность карточки | `slate-50` | `#f8fafc` | — |
| Поверхность sidebar | `slate-100` | `#f1f5f9` | — |
| Бордер / разделитель | `slate-200` | `#e2e8f0` | — |
| Бордер акцентный (focus) | `blue-800` | `#1e40af` | — |

**Dark-mode (Tailwind slate-стек):**

| Роль | Tailwind-класс | HEX |
|---|---|---|
| Поверхность страницы (bg) | `slate-900` | `#0f172a` |
| Поверхность карточки | `slate-800` | `#1e293b` |
| Поверхность sidebar / elevated | `slate-700` | `#334155` |
| Бордер | `slate-700` | `#334155` |
| Текст основной | `slate-100` | `#f1f5f9` |
| Текст вторичный | `slate-400` | `#94a3b8` |
| Акцентный / Primary | `blue-500` | `#3b82f6` |
| Акцент hover | `blue-400` | `#60a5fa` |

**Реализация переключателя:** Tailwind `darkMode: 'class'` в `tailwind.config.ts`
(класс `.dark` на `<html>`). Состояние темы хранится в `localStorage` + JS-переменной.

---

#### 7.2.2 Семантические цветовые токены

Все роли централизованы в `tailwind.config.ts` и используются через утилиты.
Ниже — «умные» семантические псевдонимы поверх slate/blue:

```typescript
// tailwind.config.ts — extend.colors
colors: {
  brand: {
    DEFAULT:  '#1e40af', // blue-800, light mode primary
    hover:    '#1d3a9e', // blue-900-ish, чуть темнее
    active:   '#1e3a8a', // blue-900
    light:    '#dbeafe', // blue-100, фон badge/highlight
    dark:     '#3b82f6', // blue-500, dark mode primary
    'dark-hover': '#60a5fa', // blue-400, dark mode hover
  },
  surface: {
    DEFAULT:  '#ffffff',
    card:     '#f8fafc', // slate-50
    sidebar:  '#f1f5f9', // slate-100
    border:   '#e2e8f0', // slate-200
  },
  // Dark-mode поверхности через Tailwind dark: prefix — не дублируются здесь
}
```

**Семантические цвета статусов** (оптимизированы под акцент blue-800,
повышена насыщенность для достаточного контраста):

| Роль | Light HEX | Tailwind | Dark HEX | Tailwind |
|---|---|---|---|---|
| Success (зелёный) | `#047857` | `emerald-700` | `#34d399` | `emerald-400` |
| Warning (янтарный) | `#b45309` | `amber-700` | `#fbbf24` | `amber-400` |
| Error / Danger | `#be123c` | `rose-700` | `#fb7185` | `rose-400` |
| Info (нейтральный) | `#1e40af` | `blue-800` | `#60a5fa` | `blue-400` |
| Open Access badge | `#047857` | `emerald-700` | `#34d399` | `emerald-400` |

> **Принцип выбора:** для light-mode использованы `-700`-ступени Tailwind
> (вместо стандартных `-500`), что обеспечивает соотношение контраста
> ≥ 4.5:1 на белом фоне без дополнительных проверок.
> Для dark-mode — `-400`-ступени на `slate-800/900` поверхностях.

---

#### 7.2.3 Типографика

**Принятое решение:**

| Роль | Шрифт | Источник | Применение |
|---|---|---|---|
| Body / UI | **Plus Jakarta Sans** | Google Fonts | Всё тело страницы, карточки, кнопки, навигация, формы |
| Display / Hero | **Instrument Serif** | Google Fonts | Hero-заголовок на главной странице, крупные секционные заголовки `/explore` |

**Обоснование пары:**
- Plus Jakarta Sans — геометрический гротеск с высоким x-height и открытыми
  счётчиками; оптимальная читаемость при 14–16px; ассоциируется с Framer, Supabase.
- Instrument Serif — элегантный академический антиква; создаёт контраст
  с sans-serif телом; визуально отсылает к серьёзному научному изданию.
  Применяется **только** для display-размеров (≥ 24px / `text-2xl`+).

**Подключение (Google Fonts):**

```html
<!-- index.html <head> -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Plus+Jakarta+Sans:wght@300..700&display=swap" rel="stylesheet">
```

**CSS-переменные в `tailwind.config.ts`:**

```typescript
theme: {
  extend: {
    fontFamily: {
      sans:    ['"Plus Jakarta Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      display: ['"Instrument Serif"', 'Georgia', 'ui-serif', 'serif'],
    },
  },
}
```

**Применение в компонентах:**
- `font-sans` — Tailwind default, применяется глобально через `body`
- `font-display` — явно указывается только на hero-заголовке и крупных
  секционных заголовках дашборда

---

#### 7.2.4 Библиотека визуализаций: Tremor

**Принятое решение:** Tremor (поверх Recharts) вместо bare Recharts.

**Обоснование:**
- Tremor предоставляет готовые React-компоненты с встроенными
  tooltip, legend, responsive behaviour — без ручной сборки из примитивов
- Tailwind-совместимый дизайн: темизация через CSS-переменные и классы
- Shadcn/ui-совместимость: оба строятся на Tailwind, конфликтов нет
- Встроенная dark mode поддержка через Tailwind `dark:` prefix
- Референсная галерея: https://www.tremor.so/charts

**Установка:**

```bash
npm install @tremor/react
```

**Импорт в компонентах:**

```typescript
import { LineChart, BarChart, DonutChart } from '@tremor/react'
```

---

#### 7.2.5 Цветовая палитра чартов

**Принятое решение:** оптимизированная палитра с повышенной контрастностью
(avg Lightness снижен с 52.5% → 36.5%, прирост контраста ~16%)
при сохранении академической элегантности.

**Палитра `src/constants/chartColors.ts`:**

```typescript
// Централизованная палитра Tremor-чартов
// Якорь: blue-800 (#1e40af, AAA 7.1:1)
// Avg L=36.5% — на 16% контрастнее стандартных Tailwind-500

export const CHART_COLORS = [
  '#1e40af', // primary-blue  — blue-800     (H 226°, S 71%, L 40%)
  '#0f766e', // teal-deep     — teal-700     (H 175°, S 77%, L 26%)
  '#6d28d9', // violet-deep   — violet-700   (H 263°, S 70%, L 50%)
  '#b45309', // amber-deep    — amber-700    (H  26°, S 90%, L 37%)
  '#be123c', // rose-deep     — rose-700     (H 345°, S 83%, L 41%)
  '#047857', // emerald-deep  — emerald-700  (H 163°, S 94%, L 24%)
] as const;

// Для dark-mode: используем на 1–2 ступени светлее
export const CHART_COLORS_DARK = [
  '#3b82f6', // blue-500
  '#14b8a6', // teal-500
  '#8b5cf6', // violet-500
  '#f59e0b', // amber-500
  '#f43f5e', // rose-500
  '#22c55e', // green-500
] as const;

// Удобные псевдонимы для смысловых ролей
export const CHART_COLOR_PRIMARY   = CHART_COLORS[0]; // синяя серия (основная)
export const CHART_COLOR_SECONDARY = CHART_COLORS[1]; // альтернативная серия
export const CHART_COLOR_OA_YES    = CHART_COLORS[5]; // Open Access — зелёный
export const CHART_COLOR_OA_NO     = '#94a3b8';        // Non-OA — нейтральный серый
```

**Передача палитры в Tremor:**

```typescript
// Пример: Publications by Year
<LineChart
  data={stats.by_year}
  index="label"
  categories={["count"]}
  colors={["blue"]}          // Tremor color name OR кастомный через className
  showLegend={false}
  showTooltip={true}
/>

// Для многоцветных чартов (доната, несколько серий):
// Tremor принимает массив: colors={["blue", "teal", "violet", "amber"]}
// Кастомные HEX пробрасываются через customTooltipFormatter или
// CSS override: style={{ "--tremor-color-chart-1": "#1e40af" }}
```

> **Практическое замечание:** Tremor v3+ поддерживает передачу HEX напрямую
> через prop `colors` в виде строк — проверить при интеграции; при необходимости
> использовать CSS custom properties override.

---

#### 7.2.6 Плотность интерфейса

**Принятое решение:** «умеренный функциональный минимализм» —
2-column карточная сетка, высота карточки 80–100px.

**Описание:**
- Список статей на главной: CSS Grid `grid-cols-2`, gap `gap-3` (12px)
- Карточка статьи: `min-h-[80px] max-h-[100px]` — достаточно для
  заголовка, автора, журнала и 2–3 badge
- KPI-карточки на `/explore` (headline stats): `grid-cols-4`, высота ~72px
- Chart-карточки на `/explore`: `grid-cols-2`, высота auto (300px chart + padding)
- На мобильном (< 768px): все сетки схлопываются в `grid-cols-1`

**Tailwind-пример карточки статьи:**

```typescript
// ArticleCard.tsx — скелет разметки
<div className="
  bg-slate-50 dark:bg-slate-800
  border border-slate-200 dark:border-slate-700
  rounded-lg p-3
  min-h-[80px]
  flex flex-col gap-1
  hover:border-blue-800 dark:hover:border-blue-500
  transition-colors
">
  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 line-clamp-2">
    {title}
  </h3>
  <p className="text-xs text-slate-500 dark:text-slate-400">
    {author} · <em>{journal}</em> · {year}
  </p>
  <div className="flex gap-1 mt-auto flex-wrap">
    {/* badges: document_type, open_access */}
  </div>
</div>
```

---

#### 7.2.7 Итоговые изменения в команды установки

По сравнению с §8 — единственное изменение: `recharts` заменяется на `@tremor/react`:

```bash
# Было:
npm install recharts

# Стало:
npm install @tremor/react
```

Все остальные команды из §8 остаются без изменений.

---

#### 7.2.8 Итоговые изменения в shadcn init

При инициализации shadcn выбрать:
- **Base color:** `slate` (совпадает с выбранной поверхностной палитрой)
- **CSS variables:** yes

Это обеспечит автоматическую генерацию CSS-переменных, совместимых
с нашим slate/blue-800 дизайн-токенами.

---

## 8. Команды для начала разработки

```bash
# Инициализация проекта в папке frontend/
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install

# Tailwind CSS v4
npm install tailwindcss @tailwindcss/vite

# Zustand
npm install zustand

# React Router
npm install react-router-dom

# axios + React Hook Form + Zod
npm install axios react-hook-form zod @hookform/resolvers

# Tremor (графики — заменяет recharts)
npm install @tremor/react

# shadcn/ui (интерактивная инициализация)
# При запросе "Which color would you like to use as base color?" → выбрать slate
npx shadcn@latest init

# Добавить компоненты shadcn по мере необходимости:
npx shadcn@latest add card badge button input tabs sheet skeleton
npx shadcn@latest add navigation-menu dropdown-menu checkbox switch
npx shadcn@latest add pagination popover command sonner
```

**`vite.config.ts` — настройка proxy для локальной разработки:**

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',  // локальный FastAPI
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
```

---

## 9. Переменные окружения

```bash
# .env.local (локальная разработка — не коммитить)
VITE_API_BASE_URL=http://localhost:8000

# .env.production (Vercel environment variables — не коммитить)
VITE_API_BASE_URL=https://<railway-service-url>
```

Все переменные с префиксом `VITE_` доступны в браузере через `import.meta.env`.
Секреты без префикса `VITE_` остаются серверными и в браузер не попадают.
`.env.local` и `.env.production` добавляются в `.gitignore`.
