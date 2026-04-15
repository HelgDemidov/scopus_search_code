
# Frontend Technical Specification
## Scopus Research Search — Web Interface

**Версия:** 1.0  
**Дата:** 2026-04-15  
**Репозиторий:** `https://github.com/HelgDemidov/scopus_search_code`
**Рабочая ветка:** `web-frontend-development`  
**Статус:** Draft — два блока требуют финального решения (отмечены ⚠️)

---

## 1. Контекст и цели

Scopus Research Search — веб-сервис для поиска и просмотра научных публикаций
через Scopus API. Бэкенд реализован на FastAPI + PostgreSQL (Supabase),
развёрнут на Railway. Фронтенд разрабатывается как отдельный клиент,
взаимодействующий с бэкендом исключительно через HTTP REST API.

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
Все приватные запросы добавляют заголовок `Authorization: Bearer <token>`.
Срок жизни токена: 30 минут (`ACCESS_TOKEN_EXPIRE_MINUTES=30`).
Фронтенд обрабатывает `401 Unauthorized` — очищает токен и перенаправляет
на страницу логина.

---

## 3. Структура страниц и маршрутизация

```
/                 → Главная страница (публичная + расширенная для авторизованных)
/explore          → Аналитический дашборд коллекции (публичная)
/auth             → Страница авторизации (логин / регистрация)
/profile          → Личный кабинет (только для авторизованных, redirect иначе)
```

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
- Поисковая строка фильтрует локально по `GET /articles/?page&size`
  (client-side фильтрация по полю `title` или серверная через параметры —
  уточняется при выборе фреймворка)
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

#### Sidebar фильтров
Данные для фильтров получаются из `GET /articles/stats` (поля
`by_year`, `by_doc_type`, `by_country`) при загрузке страницы.

| Фильтр | Тип элемента |
|---|---|
| Год публикации | Range slider или multi-select чекбоксы |
| Тип документа | Чекбоксы с счётчиком |
| Open Access only | Toggle |
| Страна аффиляции | Multi-select с поиском |

#### Сортировка и пагинация
- Сортировка: по дате (убыв. по умолчанию), по цитированиям
- Пагинация: кнопки страниц + счётчик «Showing 1–10 of 1 842 results»
  (поле `total` из `PaginatedArticleResponse`)

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

#### Графики (⚠️ визуальный дизайн не определён — см. раздел 7)

| Блок | Тип графика | Данные |
|---|---|---|
| Publications by Year | Line chart | `by_year` |
| Top 10 Journals | Horizontal bar | `by_journal` |
| Open Access Ratio | Donut chart | `open_access_count` vs остальное |
| Top Countries | Bar chart | `by_country` |
| Document Types | Donut или bar | `by_doc_type` |
| Top Research Topics | Tag cloud или bar | `top_keywords` |

#### CTA-блок
После графиков — баннер:
«Want to search Scopus live? [Create account] or [Sign in]»

---

### 4.3 Страница авторизации `/auth`

**Назначение:** единый экран логина и регистрации.

#### Структура
- Два таба: **Sign In** / **Create Account**
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

#### Обработка ошибок
- `409 Conflict` при регистрации → inline-сообщение «Email already registered»
- `401 Unauthorized` при логине → «Invalid email or password»
- Ошибки отображаются inline под соответствующим полем, не через toast

#### Google OAuth flow
`/auth/google/callback` возвращает `{access_token, token_type}`.
Фронтенд на `/auth` (или отдельном callback-маршруте) перехватывает этот
ответ, сохраняет токен в `localStorage`, редиректит на `/`.

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
- Кнопка «Sign Out» → очищает `localStorage`, редиректит на `/`

---

## 5. Общие UX-требования

### Состояния загрузки
- Skeleton-лоадеры для списка карточек (не спиннер)
- Skeleton для графиков на `/explore` (серые прямоугольники-заглушки)
- Кнопки блокируются во время pending-запроса (disabled + индикатор)

### Пустые состояния
- Поиск без результатов: иллюстрация + текст «No articles found.
  Try a different keyword.»
- Коллекция пуста (база ещё не заполнена сидером): «The collection
  is being built. Check back soon.»

### Обработка ошибок сети
- `500` / сеть недоступна → toast «Server error. Please try again.»
- `401` на приватном эндпоинте → автологаут + редирект на `/auth`

### Адаптивность
- Desktop-first; минимально поддерживаемая ширина: **1024px** для
  дашборда, **375px** для `/auth` и карточек
- Sidebar фильтров на мобильном сворачивается в drawer/sheet

---

## 6. Навигация и хедер

**Для анонима:** логотип/название + ссылки [Explore] [Sign In]  
**Для авторизованного:** логотип + [Explore] + аватар/имя → dropdown
[Profile] [Sign Out]

---

## 7. Нерешённые вопросы ⚠️

### 7.1 Выбор фронтенд-фреймворка

**Решение не принято.** Рассматриваемые варианты:

| Вариант | За | Против |
|---|---|---|
| **Vue 3 + Vite** | Пологая кривая обучения, отличная документация, Composition API близок к Python-логике | Меньше экосистемы, чем у React |
| **React + Vite** | Самая большая экосистема, максимум готовых компонентов | JSX-синтаксис, более высокий порог входа |
| **Nuxt 3** | SSR из коробки, SEO, файловая маршрутизация | Избыточен для SPA без SEO-требований |
| **SvelteKit** | Минимальный бойлерплейт, высокая производительность | Небольшая экосистема |

Решение принимается до начала разработки. Выбор влияет на структуру
репозитория, способ хранения состояния и выбор UI-компонентной библиотеки.

### 7.2 Визуальный дизайн

**Решение не принято.** Требуется определить:

- **Цветовая схема:** светлая / тёмная / обе с переключателем
- **Акцентный цвет:** нейтральный технический (синий, серый) vs
  выразительный научный (индиго, терракота)
- **Типографика:** display-шрифт для hero + body-шрифт для карточек
- **Визуализации:** библиотека для графиков (`Chart.js`, `Recharts`,
  `ECharts`, `Plotly.js`) и цветовая палитра чартов
- **Плотность интерфейса:** компактная (таблица/список) vs карточная
  (grid с превью)

До принятия этих решений разработка начинается с нейтральной базовой
системы токенов, которая заменяется по итогам дизайн-сессии.
```