# Frontend Technical Specification
## Scopus Research Search — Web Interface

**Версия:** 2.0
**Дата:** 2026-04-15
**Репозиторий:** `https://github.com/HelgDemidov/scopus_search_code`
**Рабочая ветка:** `web-frontend-development`
**Статус:** Draft — один блок требует финального решения (отмечен ⚠️)

**История версий:**

| Версия | Дата | Изменения |
|---|---|---|
| 1.0 | 2026-04-15 | Первичная структура документа |
| 2.0 | 2026-04-15 | Зафиксирован стек React + Vite + Zustand + Recharts; заполнен раздел 7.1; обновлены разделы 1, 4.1, 7.2, 8, 9 |

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
- **Графики:** Recharts 2
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

#### Графики (⚠️ визуальный дизайн не определён — см. раздел 7.2)

**Библиотека графиков: Recharts 2** (финальное решение).

| Блок | Тип графика | Recharts-компонент | Данные |
|---|---|---|---|
| Publications by Year | Line chart | `<LineChart>` + `<Line>` | `by_year` |
| Top 10 Journals | Horizontal bar | `<BarChart layout="vertical">` | `by_journal` |
| Open Access Ratio | Donut chart | `<PieChart>` + `<Pie innerRadius>` | `open_access_count` vs остальное |
| Top Countries | Bar chart | `<BarChart>` | `by_country` |
| Document Types | Donut | `<PieChart>` + `<Pie innerRadius>` | `by_doc_type` |
| Top Research Topics | Horizontal bar | `<BarChart layout="vertical">` | `top_keywords` |

**Общие требования к графикам:**
- `<ResponsiveContainer width="100%" height={300}>` для адаптивности
- `<Tooltip>` с кастомным `formatter` для числовых меток
- `<Legend>` для многорядных чартов
- Скелетон-заглушки при загрузке данных (серые прямоугольники той же высоты)
- Цветовая палитра чартов определяется в разделе 7.2

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
Recharts-компоненты получают данные напрямую из `stats` — без
промежуточных трансформаций (формат `{label, count}` совпадает
с Recharts `dataKey`-соглашением).

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
- Все Recharts-компоненты обёрнуты в `<ResponsiveContainer>`

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

## 7. Нерешённые вопросы ⚠️

### 7.1 Выбор фронтенд-фреймворка ✅ РЕШЕНО

**Принятое решение:** React 19 + Vite 6 + TypeScript 5 (SPA).

#### Обоснование

Решение принято по результатам анализа по пяти критериям
(взвешенная скоринговая модель, оценка 9.6/10 из 10):

| Критерий | Вес | Обоснование |
|---|---|---|
| AI-покрытие + зрелость экосистемы | 25% | React — наибольший объём обучающих данных в LLM-моделях (~40% фронтенд-проектов, State of JS 2024); максимальное покрытие Stack Overflow / GitHub примеров |
| Инфографика vs легковесность | 25% | Recharts из коробки; Vite bundle ~150–200 KB gzip; полная интерактивность без архитектурных компромиссов |
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
| Графики | Recharts | 2 | MIT |
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

**Графики (Recharts):**
- Каждый chart-компонент выделен в отдельный файл в `src/components/charts/`
- Все обёрнуты в `<ResponsiveContainer>` для адаптивности
- Скелетон-заглушки при `isLoading=true` (shadcn `<Skeleton>`)
- Цветовая палитра чартов централизована в `src/constants/chartColors.ts`

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
│   │   ├── charts/             # Recharts-компоненты дашборда
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
│   │   └── chartColors.ts      # Централизованная палитра для Recharts
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

**Решение не принято.** Требуется определить:

- **Цветовая схема:** светлая / тёмная / обе с переключателем
- **Акцентный цвет:** нейтральный технический (синий, серый) vs
  выразительный научный (индиго, терракота)
- **Типографика:** display-шрифт для hero + body-шрифт для карточек
  (рекомендации: Fontshare Satoshi или General Sans для body;
  Instrument Serif или Cabinet Grotesk для display)
- **Визуализации:** цветовая палитра чартов Recharts
  (определяется в `src/constants/chartColors.ts`)
- **Плотность интерфейса:** компактная (таблица/список) vs карточная
  (grid с превью)

До принятия этих решений разработка ведётся с нейтральной базовой
системой Tailwind-токенов (shadcn/ui defaults), которая заменяется
по итогам дизайн-сессии.

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

# Recharts
npm install recharts

# shadcn/ui (интерактивная инициализация)
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
