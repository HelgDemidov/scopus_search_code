# Frontend Technical Specification
## Scopus Research Search — Web Interface

**Версия:** 5.0
**Дата:** 2026-04-16
**Репозиторий:** `https://github.com/HelgDemidov/scopus_search_code`
**Рабочая ветка:** `web-frontend-development`
**Статус:** Approved for implementation ✅

**История версий:**

| Версия | Дата | Изменения |
|---|---|---|
| 1.0 | 2026-04-15 | Первичная структура документа |
| 2.0 | 2026-04-15 | Зафиксирован стек React + Vite + Zustand + Tremor; заполнен раздел 7.1; обновлены разделы 1, 4.1, 7.2, 8, 9 |
| 2.1 | 2026-04-15 | §7.2 РЕШЕНО: цветовая схема, акцент, типографика, чарты (Tremor), плотность UI |
| 3.0 | 2026-04-16 | Закрыты все 17 замечаний adversarial-анализа: Tailwind v3, Tremor v3, OAuth popup flow, keyword-фильтр, UserResponse.created_at, ArticleFilters, StatsStore/ArticleStore split, localStorage XSS-примечание, деплой-чеклист |
| 5.0 | 2026-04-16 | Закрыты все 13 замечаний финальной проверки: исправлен OAuth redirect flow (§3, §4.3), диаграмма, пометка Варианта B, tailwind.config.ts init, источник данных фильтров, сортировка client-side, CJS/ESM postcss, .env.production/Vercel, автологин form-data |

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
- **Стили:** Tailwind CSS **v3** (PostCSS-пайплайн; shadcn/ui и Tremor v3 несовместимы с Tailwind v4)
- **Графики:** Tremor **v3** (поверх Recharts — финальное решение, см. §7.2)
- **HTTP-клиент:** axios 1.x с interceptors
- **Роутинг:** React Router v7 (`react-router-dom`)
- **Хостинг:** Vercel (бесплатный tier, поддомен `<project>.vercel.app`)

> **⚠️ Tailwind v3, не v4.** shadcn/ui и Tremor v3 не поддерживают Tailwind v4
> (отсутствует `tailwind.config.ts`, иной механизм тем). Использование v4
> сломает генерацию shadcn-компонентов и Tremor-темизацию. Фиксируем v3
> на весь жизненный цикл этой версии фронтенда.

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
| `GET` | `/articles/` | Paginated список статей из БД; params: `page`, `size`, `keyword` (опц.) |
| `GET` | `/articles/stats` | Агрегированная статистика по `is_seeded=TRUE`; JWT не требуется |
| `GET` | `/auth/google/login` | Редирект на Google OAuth consent screen |
| `GET` | `/auth/google/callback` | OAuth callback → возвращает `{access_token, token_type}` как JSON (не редирект) |
| `POST` | `/users/register` | Регистрация; body JSON: `{username, email, password, password_confirm}` |
| `POST` | `/users/login` | Email/password логин; **form-data** (`username`, `password`) → `{access_token, token_type}` |
| `POST` | `/users/password-reset-request` | Запрос сброса пароля по email |
| `GET` | `/health` | Health-check |

> **⚠️ `POST /users/login` — form-data, не JSON.** Бэкенд использует
> `OAuth2PasswordRequestForm` из FastAPI, который принимает
> `application/x-www-form-urlencoded` с полем **`username`** (не `email`).
> В UI поле подписано «Email», но в HTTP-запросе оно называется `username`.
> axios должен отправлять `new URLSearchParams({ username: email, password })`,
> а не `JSON.stringify(...)`.

### 2.2 Приватные эндпоинты (требуют `Authorization: Bearer <jwt>`)

| Метод | Путь | Назначение |
|---|---|---|
| `GET` | `/articles/find` | Live-поиск в Scopus; params: `keyword`, `count` (1–25); заголовки ответа: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` |
| `GET` | `/users/me` | Профиль текущего пользователя → `{id, username, email, created_at}` |

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

> `is_seeded` — служебное поле БД; в `ArticleResponse` не экспонируется.

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

**`UserResponse`** (возвращается `/users/me` и `/users/register`)
```json
{
  "id": 1,
  "username": "string | null",
  "email": "string",
  "created_at": "2026-04-15T10:00:00 | null"
}
```

> **`username` может быть `null`** у пользователей, зарегистрировавшихся
> через Google OAuth — они создаются без явного username.
> Фронтенд должен обрабатывать этот случай во всех местах отображения имени
> (заголовок, аватар-инициалы, профиль): показывать часть email до `@` как fallback.

### 2.4 Авторизация и хранение токена

JWT-токен хранится в `localStorage` (ключ: `access_token`).
Все приватные запросы добавляют заголовок `Authorization: Bearer <token>`
через axios request interceptor — централизованно, без дублирования в компонентах.
Срок жизни токена: 30 минут (`ACCESS_TOKEN_EXPIRE_MINUTES=30`).
Фронтенд обрабатывает `401 Unauthorized` через axios response interceptor —
очищает токен из `localStorage` и Zustand-стора, перенаправляет на `/auth`.

> **Примечание о безопасности:** хранение JWT в `localStorage` уязвимо к XSS-атакам
> (злоумышленный скрипт на странице может прочитать токен). Для данного pet-проекта
> это приемлемый компромисс. В production-системе следует рассмотреть `httpOnly cookie`
> (токен недоступен JavaScript) с CSRF-защитой.

---

## 3. Структура страниц и маршрутизация

```
/                 → Главная страница (публичная + расширенная для авторизованных)
/explore          → Аналитический дашборд коллекции (публичная)
/auth             → Страница авторизации (логин / регистрация)
/auth/callback    → Обработчик Google OAuth redirect; парсит ?token= из URL, сохраняет токен
/profile          → Личный кабинет (только для авторизованных, redirect иначе)
```

**Реализация:** React Router v7 (`react-router-dom`) с `createBrowserRouter`.
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
- Поисковая строка отправляет `GET /articles/?page=1&size=10&keyword=<value>` —
  серверная фильтрация по точному совпадению с полем `keyword` (поисковая фраза сидера).
  Если введённый текст не совпадает ни с одним keyword сидера — возвращается пустой список;
  в этом случае показывается состояние «No articles found».
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

#### Интерфейс `ArticleFilters`

```typescript
// src/types/api.ts
interface ArticleFilters {
  keyword?: string;        // фраза сидера для серверной фильтрации
  yearFrom?: number;       // нижняя граница года публикации (client-side)
  yearTo?: number;         // верхняя граница года публикации (client-side)
  docTypes?: string[];     // массив типов документов (client-side)
  openAccessOnly?: boolean; // только open access (client-side)
  countries?: string[];    // массив стран аффиляции (client-side)
}
```

> Фильтр `keyword` отправляется на бэкенд как query-param.
> Остальные фильтры (`yearFrom`, `yearTo`, `docTypes`, `openAccessOnly`, `countries`)
> применяются client-side к уже загруженному набору статей —
> бэкенд их не поддерживает в текущей версии API.

#### Управление состоянием страницы (Zustand)

Состояние главной страницы управляется через `useArticleStore`.
**Статистика (`stats`) живёт исключительно в `useStatsStore`** —
`useArticleStore` её не содержит и не запрашивает:

```typescript
// src/stores/articleStore.ts
interface ArticleStore {
  // Данные
  articles: ArticleResponse[];
  total: number;

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
Данные для фильтров берутся из **`useStatsStore().stats`** (поля
`by_year`, `by_doc_type`, `by_country`) — стор уже заполнен при монтировании
главной страницы запросом `GET /articles/stats`. Повторный запрос не нужен.

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

> **⚠️ Сортировка по цитированиям — client-side, не глобальная.**
> `GET /articles/` не принимает параметр сортировки. Сортировка по
> `cited_by_count` применяется только к текущей загруженной странице
> (10 статей), а не ко всей базе из 1842 записей. Это важно для UX:
> при переключении сортировки нужно показывать подсказку
> «Sorted within current page».

- **Реализация пагинации:** shadcn/ui предоставляет только навигационные
  примитивы (`<Pagination>`, `<PaginationItem>`, `<PaginationLink>`,
  `<PaginationPrevious>`, `<PaginationNext>`) — без логики вычисления
  диапазона страниц. Логика реализуется в кастомном хуке `usePagination`:

```typescript
// src/hooks/usePagination.ts
function usePagination(total: number, page: number, size: number) {
  const totalPages = Math.ceil(total / size);
  // возвращает массив номеров страниц с ellipsis для отображения
  // и флаги hasPrev / hasNext для кнопок навигации
}
```

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

**Библиотека графиков: Tremor v3** (поверх Recharts, финальное решение — см. §7.2).

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

**Управление состоянием дашборда:** отдельный `useStatsStore` (Zustand).
**`useArticleStore` данные stats не хранит** — только `useStatsStore`:

```typescript
// src/stores/statsStore.ts
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
  Guidelines) → **full-page redirect** на `/api/auth/google/login`

#### Таб «Sign In»
- Поле **Email** (подпись в UI: «Email»; имя поля в HTTP form-data: `username`)
- Поле Password (с toggle show/hide)
- Кнопка «Sign In» → `POST /users/login` (**form-data**: `username=<email>`, `password=<password>`)
- Ссылка «Forgot password?» → вызов `POST /users/password-reset-request`
  с показом inline-сообщения об успехе

> **Важно для имплементации:** поле Email в форме в UI называется «Email»,
> но при отправке axios должен формировать `application/x-www-form-urlencoded`
> с ключом `username`, потому что бэкенд использует `OAuth2PasswordRequestForm`:
> ```typescript
> const formData = new URLSearchParams();
> formData.append('username', data.email); // ключ — username, значение — email пользователя
> formData.append('password', data.password);
> await apiClient.post('/users/login', formData);
> ```

#### Таб «Create Account»
- Поле Username
- Поле Email
- Поле Password + подтверждение пароля (client-side валидация совпадения)
- Кнопка «Create Account» → `POST /users/register` (JSON body)
- После успешной регистрации — автологин через `POST /users/login`
  и редирект на `/`

> **Важно для имплементации автологина:** шаг `POST /users/login` после регистрации
> использует тот же `URLSearchParams`-паттерн, что и таб «Sign In» —
> **form-data, не JSON**:
> ```typescript
> const formData = new URLSearchParams();
> formData.append('username', registrationData.email);
> formData.append('password', registrationData.password);
> await apiClient.post('/users/login', formData);
> ```

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

#### Google OAuth flow — full-page redirect (Вариант A)

**Принятый flow:** бэкенд `google_callback` модифицирован для возврата
`RedirectResponse(url=f"{FRONTEND_URL}/auth/callback?token={jwt_token}")`.
Фронтенд выполняет full-page redirect и получает токен из URL-параметра.

```
[Кнопка «Continue with Google»]
    → window.location.href = '/api/auth/google/login'
        → GET /auth/google/login (бэкенд, через Vite proxy /api → Railway)
        → 302 редирект на accounts.google.com
        → [Google OAuth consent screen]
        → 302 редирект на GET /auth/google/callback (бэкенд, Railway URL)
        → RedirectResponse(FRONTEND_URL/auth/callback?token=<jwt>)
        → OAuthCallback.tsx: парсит ?token= из URL → setToken → fetchUser → navigate('/')
```

```typescript
// pages/OAuthCallback.tsx — Вариант A (бэкенд делает RedirectResponse)
const OAuthCallback = () => {
  const navigate = useNavigate();
  const { setToken, fetchUser } = useAuthStore();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (token) {
      setToken(token);
      fetchUser().then(() => navigate('/'));
    } else {
      navigate('/auth?error=oauth_failed');
    }
  }, []);

  return <div>Signing you in…</div>;
};
```

> ❌ **Вариант B — не используется в этом проекте.**
> Оставлен для документирования причины выбора Варианта A.
>
> Вариант B предполагал открытие `/auth/google/login` как popup-окна
> (`window.open(...)`) с последующей передачей токена через
> `window.opener.postMessage`. Отклонён по двум причинам:
> (1) текущий бэкенд возвращает `JSONResponse`, а не HTML с JS для `postMessage` —
> popup просто показал бы JSON как страницу, без передачи токена родительскому окну;
> (2) cross-origin ограничения между Railway и Vercel блокируют `postMessage`
> без дополнительной relay-страницы на бэкенде.
> Вариант A (модификация `google_callback` в `auth.py`) проще и надёжнее.

**Конфигурация `OAUTH_REDIRECT_URI` (бэкенд):**

```bash
# Railway environment variables
OAUTH_REDIRECT_URI=https://<railway-service-url>/auth/google/callback  # prod
# При локальной разработке:
OAUTH_REDIRECT_URI=http://localhost:8000/auth/google/callback
```

Фронтенд URI не контролирует — он задаётся только на стороне бэкенда
и в Google OAuth Console (Authorized redirect URIs).

**Управление состоянием авторизации:** `useAuthStore` (Zustand):

```typescript
// src/stores/authStore.ts
interface AuthStore {
  token: string | null;
  user: {
    id: number;
    username: string | null;  // null у Google OAuth пользователей
    email: string;
    created_at: string | null;
  } | null;
  isAuthenticated: boolean;

  setToken: (token: string) => void;
  fetchUser: () => Promise<void>;
  logout: () => void;
}
```

`setToken` записывает токен в `localStorage` и стор одновременно.
`logout` очищает оба. При старте приложения `App.tsx` читает токен
из `localStorage` и инициализирует стор (hydration):

```typescript
// App.tsx — hydration при старте
useEffect(() => {
  const token = localStorage.getItem('access_token');
  if (token) {
    // Восстанавливаем токен в стор без немедленной валидации.
    // Токен будет проверен при первом приватном запросе (GET /users/me):
    // если он истёк — axios response interceptor вызовет logout() автоматически.
    authStore.setToken(token);
  }
}, []);
```

**Отображение имени пользователя (fallback для `username: null`):**

```typescript
// Везде, где нужно показать имя пользователя:
const displayName = user.username ?? user.email.split('@')[0];
```

---

### 4.4 Страница профиля `/profile`

**Назначение:** личный кабинет авторизованного пользователя.
Неавторизованный пользователь редиректится на `/auth`.

Данные профиля: `GET /users/me` → `{id, username, email, created_at}`.

#### Блоки страницы

**Идентификация**
- Аватар (инициалы из `username ?? email.split('@')[0]`, без загрузки фото — API не поддерживает)
- Username (если `null` — показать прочерк или «—»), Email (только просмотр)
- `created_at` — дата регистрации (отформатировать как `DD MMM YYYY`)
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

**Имя в хедере:** `user.username ?? user.email.split('@')[0]`

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
| Совместимость с FastAPI / JWT / OAuth | 15% | Чистый SPA без мнений об авторизации; JWT в localStorage — стандартная практика; OAuth через бэкенд без конфликтов |

#### Финальный стек

| Слой | Технология | Версия | Пакет | Лицензия |
|---|---|---|---|---|
| Фреймворк | React | 19 | `react` | MIT |
| Сборщик | Vite | 6 | `vite` | MIT |
| Язык | TypeScript | 5 | `typescript` | Apache 2.0 |
| State management | Zustand | 5 | `zustand` | MIT |
| UI-компоненты | shadcn/ui | latest | `shadcn` CLI | MIT |
| Примитивы UI | Radix UI | latest | `@radix-ui/*` | MIT |
| Стили | Tailwind CSS | **v3** | `tailwindcss` | MIT |
| Графики | Tremor | **v3** | `@tremor/react@3` | Apache 2.0 |
| Роутинг | React Router | v7 | `react-router-dom` | MIT |
| HTTP-клиент | axios | 1.x | `axios` | MIT |
| Формы | React Hook Form | 7 | `react-hook-form` | MIT |
| Валидация форм | Zod | 3 | `zod` | MIT |
| Toast-уведомления | Sonner (shadcn) | latest | через shadcn CLI | MIT |
| Хостинг | Vercel | — | — | Free tier |

> **Tailwind CSS v3, не v4.** Это намеренное ограничение версии: shadcn/ui
> и Tremor v3 требуют `tailwind.config.ts` с `content[]`, `darkMode`, `theme.extend` —
> всё это специфично для v3. Tailwind v4 использует принципиально иную архитектуру
> (CSS-first конфигурация, без `tailwind.config.ts`), несовместимую с этими библиотеками.

#### Ключевые архитектурные решения

**State management (Zustand) — три независимых стора:**
- `useAuthStore` — токен, данные пользователя, `isAuthenticated`
- `useArticleStore` — список статей, фильтры, пагинация, live-поиск
- `useStatsStore` — агрегированная статистика для `/explore`

Сторы не связаны между собой напрямую. `fetchStats` живёт **только в `useStatsStore`**.
`useArticleStore` не хранит и не запрашивает статистику.

**HTTP-клиент (axios):**
- Единственный экземпляр axios создаётся в `src/api/client.ts`
- Request interceptor добавляет `Authorization: Bearer <token>` из `authStore`
- Response interceptor обрабатывает `401` → вызывает `authStore.logout()`

**Компонентная библиотека (shadcn/ui):**
- Компоненты копируются в проект (`src/components/ui/`) — не npm-зависимость
- Позволяет кастомизировать под любую дизайн-систему без версионных конфликтов
- Инициализация: `npx shadcn@latest init` при создании проекта
- При инициализации выбрать: **base color = slate**, CSS variables = yes

**Графики (Tremor v3):**
- Каждый chart-компонент выделен в отдельный файл в `src/components/charts/`
- Tremor's built-in responsiveness (нет необходимости в `<ResponsiveContainer>`)
- Скелетон-заглушки при `isLoading=true` (shadcn `<Skeleton>`)
- Цветовая палитра централизована в `src/constants/chartColors.ts`

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
│   │   ├── ui/                 # shadcn/ui компоненты (генерируются CLI)
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
│   ├── hooks/
│   │   └── usePagination.ts    # логика вычисления диапазона страниц
│   ├── pages/
│   │   ├── HomePage.tsx
│   │   ├── ExplorePage.tsx
│   │   ├── AuthPage.tsx
│   │   ├── OAuthCallback.tsx   # /auth/callback — обработчик Google OAuth redirect
│   │   └── ProfilePage.tsx
│   ├── stores/
│   │   ├── authStore.ts        # useAuthStore
│   │   ├── articleStore.ts     # useArticleStore
│   │   └── statsStore.ts       # useStatsStore — единственный источник stats
│   ├── types/
│   │   └── api.ts              # TypeScript-интерфейсы: ArticleResponse, StatsResponse,
│   │                           # UserResponse, ArticleFilters и др.
│   ├── constants/
│   │   └── chartColors.ts      # Централизованная палитра для Tremor-чартов
│   ├── App.tsx                 # Router + token hydration
│   └── main.tsx
├── index.html
├── vite.config.ts
├── tailwind.config.ts          # v3-конфиг: content[], darkMode:'class', theme.extend
├── postcss.config.js           # tailwindcss + autoprefixer
├── tsconfig.json
└── package.json
```

#### Хостинг и деплой (Vercel)

- Фронтенд деплоится на Vercel отдельно от бэкенда (Railway)
- Автодеплой: каждый push в `web-frontend-development` → preview deployment;
  merge в `main` → production deployment
- Переменные окружения в Vercel: `VITE_API_BASE_URL=https://<railway-url>`
- `vercel.json` для SPA-маршрутизации:

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

#### Чеклист при деплое на Vercel *(выполнить после создания Vercel-проекта)*

| # | Действие | Где |
|---|---|---|
| 1 | Добавить `https://<project>.vercel.app` в **Authorized JavaScript origins** | Google OAuth Console → Credentials |
| 2 | Добавить `https://<railway-url>/auth/google/callback` в **Authorized redirect URIs** | Google OAuth Console → Credentials |
| 3 | Добавить `FRONTEND_URL=https://<project>.vercel.app` в Railway env vars | Railway → Variables |
| 4 | Добавить `https://<project>.vercel.app` в `ALLOWED_ORIGINS` бэкенда (CORS) | Railway → Variables |
| 5 | Добавить `VITE_API_BASE_URL=https://<railway-url>` в Vercel env vars | Vercel → Settings → Environment Variables |

> Действия 1–4 преждевременны до создания Vercel-проекта.
> Вернуться к этому чеклисту на этапе деплоя фронтенда.

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

**Реализация переключателя:** Tailwind v3 `darkMode: 'class'` в `tailwind.config.ts`
(класс `.dark` на `<html>`). Состояние темы хранится в `localStorage` + JS-переменной.

---

#### 7.2.2 Семантические цветовые токены

Все роли централизованы в `tailwind.config.ts` и используются через утилиты.

```typescript
// tailwind.config.ts — extend.colors
colors: {
  brand: {
    DEFAULT:  '#1e40af', // blue-800, light mode primary
    hover:    '#1d3a9e',
    active:   '#1e3a8a', // blue-900
    light:    '#dbeafe', // blue-100
    dark:     '#3b82f6', // blue-500, dark mode primary
    'dark-hover': '#60a5fa', // blue-400
  },
  surface: {
    DEFAULT:  '#ffffff',
    card:     '#f8fafc', // slate-50
    sidebar:  '#f1f5f9', // slate-100
    border:   '#e2e8f0', // slate-200
  },
}
```

**Семантические цвета статусов:**

| Роль | Light HEX | Tailwind | Dark HEX | Tailwind |
|---|---|---|---|---|
| Success (зелёный) | `#047857` | `emerald-700` | `#34d399` | `emerald-400` |
| Warning (янтарный) | `#b45309` | `amber-700` | `#fbbf24` | `amber-400` |
| Error / Danger | `#be123c` | `rose-700` | `#fb7185` | `rose-400` |
| Info (нейтральный) | `#1e40af` | `blue-800` | `#60a5fa` | `blue-400` |
| Open Access badge | `#047857` | `emerald-700` | `#34d399` | `emerald-400` |

---

#### 7.2.3 Типографика

**Принятое решение:**

| Роль | Шрифт | Источник | Применение |
|---|---|---|---|
| Body / UI | **Plus Jakarta Sans** | Google Fonts | Всё тело страницы, карточки, кнопки, навигация, формы |
| Display / Hero | **Instrument Serif** | Google Fonts | Hero-заголовок на главной странице, крупные секционные заголовки `/explore` |

**Подключение (Google Fonts):**

```html
<!-- index.html <head> -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Plus+Jakarta+Sans:wght@300..700&display=swap" rel="stylesheet">
```

**`tailwind.config.ts` (v3-синтаксис):**

```typescript
// tailwind.config.ts — полный конфиг для v3
import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
    './node_modules/@tremor/react/**/*.{js,ts,jsx,tsx}', // нужно для Tremor
  ],
  darkMode: 'class',  // переключение через класс .dark на <html>
  theme: {
    extend: {
      fontFamily: {
        sans:    ['"Plus Jakarta Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['"Instrument Serif"', 'Georgia', 'ui-serif', 'serif'],
      },
      colors: {
        // brand и surface токены — см. §7.2.2
        // chart-цвета — см. §7.2.5: регистрируются в theme.extend.colors
        // и дополнительно добавляются в safelist для защиты от purge
      },
    },
  },
  plugins: [],
}

export default config
```

> **Ключевой момент:** `node_modules/@tremor/react/**/*.{js,ts,jsx,tsx}` в `content[]`
> обязателен — иначе Tailwind v3 purge удалит CSS-классы, используемые Tremor внутри
> своих компонентов, и графики потеряют стили в production-сборке.

---

#### 7.2.4 Библиотека визуализаций: Tremor v3

**Принятое решение:** Tremor v3 (поверх Recharts) вместо bare Recharts.

**Обоснование:**
- Tremor предоставляет готовые React-компоненты с встроенными
  tooltip, legend, responsive behaviour
- Tailwind v3-совместимый дизайн
- shadcn/ui-совместимость: оба строятся на Tailwind, конфликтов нет
- Встроенная dark mode через Tailwind `dark:` prefix

**Установка с фиксацией версии:**

```bash
npm install @tremor/react@3
```

**Импорт в компонентах:**

```typescript
import { LineChart, BarChart, DonutChart } from '@tremor/react'
```

---

#### 7.2.5 Цветовая палитра чартов

**Как Tremor v3 принимает цвета:**

Tremor v3 принимает **только именованные цвета Tailwind** в prop `colors`
(например, `"blue"`, `"teal"`, `"violet"`) — **не HEX-строки**.
Под капотом Tremor генерирует классы вида `fill-blue-500`, `stroke-teal-600` и т.д.
Чтобы использовать кастомные цвета (HEX), нужно:

1. **Зарегистрировать их в `tailwind.config.ts`** через `theme.extend.colors`
   с именем, которое затем передаётся в Tremor:

```typescript
// tailwind.config.ts — добавить в theme.extend.colors
colors: {
  'chart-blue':    { DEFAULT: '#1e40af', 500: '#1e40af' },
  'chart-teal':    { DEFAULT: '#0f766e', 500: '#0f766e' },
  'chart-violet':  { DEFAULT: '#6d28d9', 500: '#6d28d9' },
  'chart-amber':   { DEFAULT: '#b45309', 500: '#b45309' },
  'chart-rose':    { DEFAULT: '#be123c', 500: '#be123c' },
  'chart-emerald': { DEFAULT: '#047857', 500: '#047857' },
}
```

2. **Добавить safelist** — отдельный ключ верхнего уровня конфига (рядом с `content`,
   `theme`, `plugins`). Это предотвращает удаление классов, которые Tremor использует
   динамически (не через статический scan `content[]`):

```typescript
// tailwind.config.ts — safelist на верхнем уровне
safelist: [
  { pattern: /^(fill|stroke|text|bg)-(chart-blue|chart-teal|chart-violet|chart-amber|chart-rose|chart-emerald)/ },
]
```

3. **Передавать именованные строки в Tremor:**

```typescript
<BarChart
  data={stats.by_country}
  index="label"
  categories={["count"]}
  colors={["chart-blue"]}   // имя из tailwind.config, не HEX
/>
```

**Файл `src/constants/chartColors.ts`:**

```typescript
// Именованные цвета для Tremor (должны совпадать с ключами в tailwind.config.ts)
export const CHART_COLORS = [
  'chart-blue',
  'chart-teal',
  'chart-violet',
  'chart-amber',
  'chart-rose',
  'chart-emerald',
] as const;

// HEX-значения — только для справки (документация, README, дизайн-токены)
export const CHART_HEX = {
  'chart-blue':    '#1e40af',  // blue-800
  'chart-teal':    '#0f766e',  // teal-700
  'chart-violet':  '#6d28d9',  // violet-700
  'chart-amber':   '#b45309',  // amber-700
  'chart-rose':    '#be123c',  // rose-700
  'chart-emerald': '#047857',  // emerald-700
} as const;

// Dark-mode — светлее на 1–2 ступени; зарегистрировать аналогично в tailwind.config
export const CHART_COLORS_DARK = [
  'chart-blue-dark',    // #3b82f6 blue-500
  'chart-teal-dark',    // #14b8a6 teal-500
  'chart-violet-dark',  // #8b5cf6 violet-500
  'chart-amber-dark',   // #f59e0b amber-500
  'chart-rose-dark',    // #f43f5e rose-500
  'chart-emerald-dark', // #22c55e green-500
] as const;

export const CHART_COLOR_PRIMARY   = CHART_COLORS[0];
export const CHART_COLOR_SECONDARY = CHART_COLORS[1];
export const CHART_COLOR_OA_YES    = CHART_COLORS[5]; // emerald — Open Access
export const CHART_COLOR_OA_NO     = 'slate';          // Non-OA — нейтральный
```

---

#### 7.2.6 Плотность интерфейса

**Принятое решение:** «умеренный функциональный минимализм» —
2-column карточная сетка, высота карточки 80–100px.

- Список статей на главной: CSS Grid `grid-cols-2`, gap `gap-3` (12px)
- Карточка статьи: `min-h-[80px] max-h-[100px]`
- KPI-карточки на `/explore`: `grid-cols-4`, высота ~72px
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

По сравнению с §8: `recharts` заменяется на `@tremor/react@3`,
Tailwind v4-пакеты заменяются на v3-пайплайн с PostCSS:

```bash
# Было (v4):
npm install tailwindcss @tailwindcss/vite
npm install @tremor/react

# Стало (v3 + Tremor v3):
npm install -D tailwindcss@3 postcss autoprefixer
npm install @tremor/react@3
```

---

## 8. Команды для начала разработки

```bash
# Инициализация проекта в папке frontend/
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install

# Tailwind CSS v3 (PostCSS-пайплайн; НЕ @tailwindcss/vite — это v4)
npm install -D tailwindcss@3 postcss autoprefixer
npx tailwindcss init -p  # создаёт tailwind.config.js и postcss.config.js

# Переименовать конфиг в .ts и добавить типизацию:
mv tailwind.config.js tailwind.config.ts
# Добавить в начало tailwind.config.ts:
#   import type { Config } from 'tailwindcss'
# Обернуть объект:
#   const config: Config = { ... }
#   export default config

# Zustand
npm install zustand

# React Router v7
npm install react-router-dom

# axios + React Hook Form + Zod
npm install axios react-hook-form zod @hookform/resolvers

# Tremor v3 (графики — фиксируем мажорную версию)
npm install @tremor/react@3

# shadcn/ui (интерактивная инициализация)
# При запросе "Which color would you like to use as base color?" → выбрать slate
# При запросе "Do you want to use CSS variables?" → yes
npx shadcn@latest init

# Добавить компоненты shadcn по мере необходимости:
npx shadcn@latest add card badge button input tabs sheet skeleton
npx shadcn@latest add navigation-menu dropdown-menu checkbox switch
npx shadcn@latest add pagination popover command sonner
```

**`postcss.config.js` (создаётся автоматически через `npx tailwindcss init -p`):**

```javascript
// postcss.config.js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

> **⚠️ CJS vs ESM в `postcss.config.js`:** `npx tailwindcss init -p` может
> сгенерировать CJS-версию (`module.exports = { ... }`). Если в `package.json`
> есть `"type": "module"` (что типично для Vite-проектов), Node.js будет
> интерпретировать `.js`-файлы как ESM и выдаст ошибку `require is not defined`.
> Проверить синтаксис после генерации: если файл начинается с `module.exports`,
> заменить на `export default` (пример выше). Альтернатива — переименовать
> в `postcss.config.cjs`.

**`vite.config.ts` — proxy для локальной разработки (только dev, не production):**

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
// НЕ импортируем @tailwindcss/vite — это плагин только для Tailwind v4

export default defineConfig({
  plugins: [react()],
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
# .env.local (локальная разработка — добавить в .gitignore)
VITE_API_BASE_URL=http://localhost:8000

# .env.production (локальная сборка prod — добавить в .gitignore)
# ВНИМАНИЕ: этот файл НЕ попадает в Vercel-сборку автоматически.
# Для деплоя переменные задаются ТОЛЬКО в Vercel UI:
# Vercel Dashboard → Project → Settings → Environment Variables
# Добавить: VITE_API_BASE_URL = https://<railway-service-url>
VITE_API_BASE_URL=https://<railway-service-url>
```

Все переменные с префиксом `VITE_` доступны в браузере через `import.meta.env`.
Секреты без префикса `VITE_` остаются серверными и в браузер не попадают.
`.env.local` и `.env.production` добавляются в `.gitignore`.
