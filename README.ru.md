# Scopus Search API

[![Backend Tests](https://github.com/HelgDemidov/scopus_search_code/actions/workflows/tests.yml/badge.svg)](https://github.com/HelgDemidov/scopus_search_code/actions/workflows/tests.yml)
[![Frontend Tests](https://github.com/HelgDemidov/scopus_search_code/actions/workflows/frontend-tests.yml/badge.svg)](https://github.com/HelgDemidov/scopus_search_code/actions/workflows/frontend-tests.yml)

Версия на английском: [README.md](README.md)

**Scopus Search API** — production fullstack-сервис для поиска, накопления и визуализации научных публикаций. В основе — интеграция с глобальной базой [Elsevier Scopus](https://www.scopus.com/). Сервис работает в двух режимах: **публичный поиск** по тематической коллекции «AI & Neural Network Technologies» (доступен без регистрации) и **live-поиск** по всей базе Scopus (требует авторизации).

---

## Возможности

| Режим | Функциональность |
|---|---|
| **Без авторизации** | Поиск и просмотр статей из тематической коллекции (~39 500 публикаций); детальные карточки статей; аналитика коллекции |
| **С авторизацией** | Live-поиск по базе Scopus (до 25 статей за запрос); история поисков с фильтрацией; счётчик недельной квоты; аналитика личных поисков |

---

## Инфраструктура и стек

```
GitHub ──► Vercel (Frontend SPA)
                │
                ▼ REST API (HTTPS)
           Railway (Backend FastAPI)
                │
                ▼ asyncpg / SQLAlchemy
           Supabase (PostgreSQL 17)

GitHub Actions ──► db_seeder (ежедневный cron)
                       │
                       ▼ POST /seeder/seed
                  Railway (Backend)
```

| Уровень | Технология | Хостинг |
|---|---|---|
| **Frontend** | React 19, TypeScript, Vite, Zustand, Axios, Recharts, shadcn/ui, Tailwind CSS | Vercel |
| **Backend** | Python 3.12, FastAPI, SQLAlchemy 2.0 async, Alembic, Pydantic v2, httpx, Authlib | Railway |
| **База данных** | PostgreSQL 17 (Supabase), Session Pooler | Supabase (eu-west-1) |
| **CI/CD** | GitHub Actions (backend pytest + frontend Vitest) | GitHub |
| **Сидер** | Python + httpx + asyncpg + OpenRouter LLM | GitHub Actions (cron) |

---

## Архитектура

### Backend

Многослойная Clean Architecture с явным разделением ответственности:

```
app/
├── routers/          # HTTP-эндпоинты: articles, auth, users, health, seeder
├── services/         # Бизнес-логика: SearchService, CatalogService,
│                     #   SearchHistoryService, UserService
├── infrastructure/   # Репозитории PostgreSQL + ScopusHTTPClient
├── interfaces/       # ABC-интерфейсы репозиториев и клиентов
├── models/           # SQLAlchemy ORM-модели (5 таблиц)
├── schemas/          # Pydantic v2 схемы запросов и ответов
├── core/             # DI, JWT, refresh-token утилиты, зависимости
├── config.py         # Pydantic Settings — единый источник конфигурации
└── main.py           # FastAPI app: middleware, роутеры, lifespan
```

### Frontend

React SPA с маршрутизацией через React Router и глобальным состоянием через Zustand:

```
frontend/src/
├── api/              # Axios-клиент (client.ts) + модули articles, auth, stats, users
├── stores/           # articleStore, authStore, historyStore, quotaStore, statsStore
├── pages/            # HomePage, ExplorePage, ProfilePage, AuthPage,
│                     #   ArticlePage, OAuthCallback
├── components/       # articles/, charts/, layout/, profile/, search/, ui/
├── hooks/            # usePagination и другие кастомные хуки
└── types/            # TypeScript-типы и интерфейсы API
```

---

## API эндпоинты

### Публичные

| Метод | Путь | Описание |
|---|---|---|
| `GET` | `/articles/` | Пагинированный список из тематической коллекции (`page`, `size`, `keyword`, `search`) |
| `GET` | `/articles/stats` | Агрегированная статистика коллекции (по годам, журналам, странам, типам) |
| `GET` | `/articles/{id}` | Детальная карточка статьи |
| `GET` | `/health` | Health-check |

### Авторизация

| Метод | Путь | Описание |
|---|---|---|
| `POST` | `/users/register` | Регистрация по email/паролю |
| `POST` | `/users/login` | Логин; возвращает AT, устанавливает RT cookie |
| `GET` | `/users/me` | Профиль текущего пользователя |
| `GET` | `/auth/google/login` | Запуск Google OAuth flow |
| `GET` | `/auth/google/callback` | OAuth callback; редирект на фронтенд с токеном |
| `POST` | `/auth/refresh` | Обмен RT cookie на новый AT + ротация RT |
| `POST` | `/auth/logout` | Отзыв RT, очистка cookie |

### Приватные (требуют JWT)

| Метод | Путь | Описание |
|---|---|---|
| `GET` | `/articles/find` | Live-поиск в Scopus (до 25 статей); проверяет квоту; сохраняет статьи и историю |
| `GET` | `/articles/find/quota` | Состояние недельной квоты: `limit`, `used`, `remaining`, `reset_at` |
| `GET` | `/articles/history` | История поисков пользователя (до 100 записей) |
| `GET` | `/articles/search/stats` | Агрегаты по статьям из личных поисков |

<details>
<summary>Квота и конкурентный доступ</summary>

Лимит — **200 live-поисков / 7 дней** (скользящее окно) на пользователя. При превышении — HTTP 429, Scopus не вызывается, запись в историю не создаётся.

Для защиты от гонок при параллельных запросах применяется `pg_advisory_xact_lock(user_id)` — блокировка берётся до проверки счётчика и снимается вместе с транзакцией. Это гарантирует корректную обработку даже при одновременных обращениях.

Заголовки Scopus Rate Limit (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`) проксируются в ответ фронтенду.

</details>

---

## База данных

Актуальная версия миграций: `0007_drop_article_legacy_columns`.

| Таблица | Назначение | Записей (prod) |
|---|---|---|
| `articles` | Нормализованный реестр публикаций Scopus | ~39 800 |
| `catalog_articles` | Принадлежность статей к тематической коллекции (keyword сидера) | ~39 500 |
| `search_history` | История live-поисков пользователей (JSONB `filters`) | ~14 |
| `search_result_articles` | Junction-таблица: поиск → статьи с `rank` | ~350 |
| `seeder_keywords` | Использованные фразы сидера с кластерами и датами | ~4 750 |
| `users` | Пользователи сервиса | ~9 |
| `refresh_tokens` | Активные refresh-токены с поддержкой ротации | ~133 |

---

## Аутентификация и безопасность

- **Access Token** — Bearer JWT, живёт 30 минут, хранится в `localStorage`.
- **Refresh Token** — хранится в `httpOnly; Secure; SameSite=None` cookie (30 дней), поддерживается ротация при каждом `/auth/refresh`. Отзыв — через `/auth/logout`.
- **Silent refresh** — Axios-interceptor на фронтенде перехватывает 401, вызывает `POST /auth/refresh` ровно один раз (Promise-синглтон предотвращает race condition), затем повторяет исходный запрос.
- **Google OAuth** — Authlib + Starlette SessionMiddleware; state в подписанной cookie — защита от CSRF.
- **CSRF guard** на `/auth/refresh` — заголовок `X-Requested-With: XMLHttpRequest` обязателен.
- **CORS** — строгий список origins из `ALLOWED_ORIGINS`; wildcard `*` с `credentials: true` не используется.
- **Seeder** — аутентификация через статичный секрет `X-Seeder-Secret` header (не пользовательский JWT).
- Чувствительные поля (`input`) вырезаются из Pydantic 422-ответов кастомным exception handler.

---

## Автоматизированный сидер

Ежедневный GitHub Actions workflow наполняет тематическую коллекцию, не расходуя пользовательскую квоту.

**Алгоритм запуска:**
1. Определяется тематический кластер дня (ротация по расписанию).
2. Из таблицы `seeder_keywords` читаются уже использованные фразы активного кластера.
3. Через OpenRouter API (LLM) генерируются до 120 новых уникальных поисковых фраз.
4. Для каждой фразы вызывается `POST /seeder/seed` на Railway-бэкенде.
5. Бэкенд запрашивает Scopus, атомарно сохраняет статьи в `articles` + `catalog_articles`, возвращает `rate_remaining`.
6. Сидер записывает результат в `seeder_keywords` и останавливается при `rate_remaining < 500`.

<details>
<summary>Конфигурация сидера</summary>

Сидер читает переменные окружения: `DATABASE_URL`, `SEEDER_SECRET`, `OPENROUTER_API_KEY`, `SEEDER_BASE_URL`.

Параметры в `seed_db.py`: `ARTICLES_PER_QUERY = 25`, `DELAY_BETWEEN_REQUESTS = 2.0` сек, `KEYWORDS_TO_USE = 120`, `RATE_LIMIT_STOP_THRESHOLD = 500`.

Подключение к Supabase через `asyncpg` с `statement_cache_size=0` (требование PgBouncer transaction mode).

</details>

---

## Тестирование

**Бэкенд:** `pytest` + `pytest-asyncio`; 100% тестов зелёные.

| Файл | Тип | Покрытие |
|---|---|---|
| `test_find_articles.py` | Integration (SQLite) | `/articles/find`, квота, история |
| `test_find_articles_postgres.py` | Integration (PG) | `pg_advisory_xact_lock`, параллельные запросы |
| `test_search_history_api.py` | Integration | История, фильтры, агрегаты |
| `test_article_by_id.py` | Integration | Детальная карточка, публичный доступ |
| `test_article_by_id_e2e.py` | E2E (Staging) | Реальный бэкенд + Supabase staging |
| `test_rt_e2e.py` / `test_rt_edge_cases.py` | E2E / Integration | RT ротация, logout, edge-cases |
| `test_articles_api.py` / `test_articles_headers.py` | Integration | Пагинация, заголовки Rate Limit |
| `test_users_api.py` | Integration | Регистрация, логин, профиль |

**Фронтенд:** Vitest; **92/92 тестов** зелёные (unit + integration).

<details>
<summary>Запуск тестов</summary>

```powershell
# Backend — только SQLite (без PostgreSQL)
pytest tests -vv -m "not requires_pg"

# Backend — все тесты (требуется PostgreSQL)
pytest tests -vv

# Frontend
cd frontend
npm run test
```

</details>

---

## Локальный запуск

<details>
<summary>Backend через Docker Compose</summary>

```powershell
docker compose up --build
```

API: `http://localhost:8000` · Swagger: `http://localhost:8000/docs`

</details>

<details>
<summary>Backend без Docker</summary>

```powershell
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
# Настройте .env на основе .env.example
alembic upgrade head
uvicorn app.main:app --reload
```

</details>

<details>
<summary>Frontend</summary>

```powershell
cd frontend
npm install
npm run dev
# http://localhost:5173
```

Переменные окружения фронтенда задаются в `frontend/.env.local`:
```
VITE_API_BASE_URL=http://localhost:8000
```

</details>

<details>
<summary>Переменные окружения (.env.example)</summary>

| Переменная | Описание |
|---|---|
| `SCOPUS_API_KEY` | API-ключ Elsevier (dev.elsevier.com) |
| `DATABASE_URL` | Connection string Supabase Session Pooler (asyncpg) |
| `SECRET_KEY` | Секрет для подписи JWT |
| `ALGORITHM` | Алгоритм JWT (HS256) |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | TTL access token (30) |
| `SESSION_SECRET_KEY` | Секрет Starlette SessionMiddleware (OAuth state) |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `OAUTH_REDIRECT_URI` | Callback URI для Google OAuth |
| `FRONTEND_URL` | URL фронтенда (CORS + OAuth redirect) |
| `ALLOWED_ORIGINS` | Список CORS origins через запятую |
| `SEEDER_SECRET` | Статичный секрет для `X-Seeder-Secret` header |
| `OPENROUTER_API_KEY` | API-ключ OpenRouter (генерация фраз сидера) |

> **Перед публикацией** проверьте `.env.example` и README на реальные домены, email-адреса и токены — замените на нейтральные placeholders.

</details>
