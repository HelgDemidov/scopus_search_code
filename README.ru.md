# Scopus Search API

[![Backend Tests](https://github.com/HelgDemidov/scopus_search_code/actions/workflows/tests.yml/badge.svg)](https://github.com/HelgDemidov/scopus_search_code/actions/workflows/tests.yml)
[![Frontend Tests](https://github.com/HelgDemidov/scopus_search_code/actions/workflows/frontend-tests.yml/badge.svg)](https://github.com/HelgDemidov/scopus_search_code/actions/workflows/frontend-tests.yml)

Версия на английском: [README.md](README.md)

**Scopus Search API** — production fullstack-сервис для поиска, накопления и визуализации научных публикаций. В основе — интеграция с глобальной базой [Elsevier Scopus](https://www.scopus.com/). Сервис работает в двух режимах: **публичный поиск** по тематической коллекции «AI & Neural Network Technologies» (доступен без регистрации) и **live-поиск** по всей базе Scopus (требует авторизации).

---

## Возможности

| Режим | Функциональность |
|---|---|
| **Без авторизации** | Просмотр и поиск тематической коллекции «AI & Neural Network Technologies» (~95 900 публикаций); многокритериальная фильтрация по году, стране, типу документа и статусу open access; детальные страницы статей; интерактивный аналитический дашборд (/explore) с cross-filter графиками, конструктором pivot-таблиц Table Builder (метрика — количество или среднее число цитирований) и статистикой по трендам, географии, типам документов, ведущим журналам, авторам и ключевым словам |
| **С авторизацией** | Все возможности без авторизации плюс: live-поиск по всей базе Scopus (до 25 результатов за запрос); личная история поисков с фильтрацией; счётчик недельной квоты API; управление аккаунтом (email/пароль · Google OAuth · сброс пароля по email); AI-конструктор таблиц — описание таблицы на естественном языке (OpenRouter LLM, с лимитом запросов) вместо ручного выбора измерений |

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

GitHub Actions ──► db_seeder (cron, каждые 2 ч)
                       │
                       ▼ POST /seeder/seed
                  Railway (Backend)
```

| Уровень | Технология | Хостинг |
|---|---|---|
| **Frontend** | React 18, TypeScript, Vite, Zustand, Axios, Recharts, shadcn/ui, Tailwind CSS | Vercel |
| **Backend** | Python 3.12, FastAPI, SQLAlchemy 2.0 async, Alembic, Pydantic v2, httpx, Authlib | Railway |
| **База данных** | PostgreSQL 17 (Supabase), Session Pooler | Supabase (eu-west-1) |
| **Кэш** | Upstash Redis (HTTPS REST, TTL 60 с) — кэш ответов `GET /articles/stats` | Upstash |
| **CI/CD** | GitHub Actions — backend (`tests.yml`: pytest · ruff · mypy · alembic check · coverage 80%), frontend (`frontend-tests.yml`: Vitest · ESLint · tsc · coverage 85% · build), staging E2E (`e2e.yml`) | GitHub |
| **Сидер** | Python + httpx + asyncpg + OpenRouter LLM | GitHub Actions (cron, каждые 2 ч) |
| **Observability** | Структурное JSON-логирование (`structlog`) + Sentry (ошибки, performance tracing, source maps) — backend и frontend | Sentry (Developer, free tier) |

---

## Архитектура

### Backend

Многослойная Clean Architecture с явным разделением ответственности:

```
app/
├── routers/          # HTTP-эндпоинты: articles, auth, users, health, seeder
├── services/         # Бизнес-логика: SearchService, CatalogService,
│                     #   ArticleService, SearchHistoryService, UserService
├── infrastructure/   # Репозитории PostgreSQL + ScopusHTTPClient + UpstashRedisClient
├── interfaces/       # ABC-интерфейсы репозиториев, клиентов, IEmailService
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
├── stores/           # articleStore, authStore, historyStore, quotaStore,
│                     #   statsStore, dashboardStore, tokenStore (AT in-memory, без localStorage)
├── pages/            # HomePage, ExplorePage, ProfilePage, AuthPage, ArticlePage,
│                     #   OAuthCallback, ForgotPasswordPage, ResetPasswordPage
├── components/       # articles/, charts/, layout/, profile/, search/, ui/
├── hooks/            # usePagination
└── types/            # TypeScript-типы и интерфейсы API
```

---

## API эндпоинты

### Публичные

| Метод | Путь | Описание |
|---|---|---|
| `GET` | `/articles/` | Пагинированный список каталога; поиск по ключевому слову / полнотекстовый + многокритериальная фильтрация (диапазон лет, страна, тип документа, open access) |
| `GET` | `/articles/stats` | Агрегированная статистика коллекции (по годам, журналам, странам, типам) |
| `GET` | `/articles/{id}` | Детальная страница статьи |
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
| `POST` | `/auth/password-reset` | Запуск сброса пароля; отправляет одноразовую ссылку через Brevo |
| `POST` | `/auth/password-reset/confirm` | Подтверждение сброса токеном; устанавливает новый пароль, отзывает все RT |

### Приватные (требуют JWT)

| Метод | Путь | Описание |
|---|---|---|
| `GET` | `/articles/find` | Live-поиск в Scopus (до 25 результатов); принимает те же фильтры, что и `GET /articles/`; проверяет квоту; сохраняет результат и историю |
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

Актуальная версия миграций: `0014_functional_indices_lower`.

| Таблица | Назначение | Записей (prod) |
|---|---|---|
| `articles` | Нормализованный реестр публикаций Scopus | ~96 700 |
| `catalog_articles` | Принадлежность статей к тематической коллекции (keyword сидера) | ~95 900 |
| `search_history` | История live-поисков пользователей (JSONB `filters`) | ~100 |
| `search_result_articles` | Junction-таблица: поиск → статьи с `rank` | ~2 300 |
| `seeder_keywords` | Использованные фразы сидера с кластерами и датами | ~19 100 |
| `users` | Пользователи сервиса | ~9 |
| `refresh_tokens` | Активные refresh-токены с поддержкой ротации | ~77 |
| `password_reset_tokens` | Одноразовые токены сброса пароля (короткоживущие) | — |

---

## Аутентификация и безопасность

- **Access Token** — Bearer JWT, живёт 30 минут, хранится **в памяти** (Zustand `tokenStore`) — никогда не сохраняется в `localStorage`; восстанавливается при загрузке страницы через `POST /auth/refresh`.
- **Refresh Token** — `httpOnly; Secure; SameSite=None` cookie (30 дней); ротируется при каждом вызове `/auth/refresh`; просроченные и отозванные токены удаляются автоматически. Отзыв — через `/auth/logout`.
- **Silent refresh** — Axios-interceptor перехватывает 401, вызывает `POST /auth/refresh` ровно один раз (Promise-синглтон предотвращает race condition), затем повторяет исходный запрос.
- **Google OAuth** — Authlib + Starlette SessionMiddleware; state в подписанной cookie (защита от CSRF).
- **Сброс пароля** — одноразовый токен доставляется через Brevo REST API (email); при подтверждении устанавливается новый пароль и отзываются все активные refresh-токены.
- **CSRF guard** на `/auth/refresh` — заголовок `X-Requested-With: XMLHttpRequest` обязателен.
- **CORS** — строгий allowlist origins из `ALLOWED_ORIGINS`; wildcard `*` с `credentials: true` не используется.
- **Seeder** — аутентификация через статичный секрет `X-Seeder-Secret` header (не пользовательский JWT).
- Чувствительные поля (`input`) вырезаются из Pydantic 422-ответов кастомным exception handler.

---

## Автоматизированный сидер

GitHub Actions workflow (запускается каждые 2 часа) наполняет тематическую коллекцию, не расходуя пользовательскую квоту.

**Алгоритм запуска:**
1. Определяется тематический кластер прогона (ротация по расписанию).
2. Из `seeder_keywords` читаются использованные фразы; выбираются кандидаты для ре-пагинации (фразы с сохранённым смещением).
3. **Блок A — новые фразы (до 50):** через OpenRouter LLM генерируются кандидаты, дедуплицируются с уже использованными, для каждой вызывается `POST /seeder/seed`, результат записывается в `seeder_keywords`.
4. **Блок B — ре-пагинация (до 188):** для каждого кандидата с сохранённым смещением вызывается `POST /seeder/seed` на следующей странице, чтобы получить дополнительные результаты Scopus по уже проиндексированным фразам.
5. Бэкенд запрашивает Scopus, атомарно upsert'ит статьи в `articles` + `catalog_articles`, возвращает `rate_remaining`.
6. Каждый из блоков останавливается при `rate_remaining < 500`.

<details>
<summary>Конфигурация сидера</summary>

Переменные окружения: `DATABASE_URL`, `SEEDER_SECRET`, `OPENROUTER_API_KEY`, `SEEDER_BASE_URL`.

Параметры в `seed_db.py`: `ARTICLES_PER_QUERY = 25`, `DELAY_BETWEEN_REQUESTS = 2.0` сек, `KEYWORDS_TO_USE = 120` (кандидаты от LLM за прогон), `NEW_KW_BUDGET = 50` (лимит блока A), `REPAG_BUDGET = 188` (лимит блока B), `RATE_LIMIT_STOP_THRESHOLD = 500`.

Подключение к Supabase через `asyncpg` с `statement_cache_size=0` (требование PgBouncer transaction mode).

</details>

---

## Тестирование

**Бэкенд:** 295 тестов (`pytest` + `pytest-asyncio`), все зелёные, три слоя:

| Слой | Тестов | Что проверяет |
|---|---|---|
| Unit (SQLite, мокированный) | 119 | Сервисы (article, catalog, search, user), Scopus-клиент, контракты интерфейсов, seeder router, Redis-кэш, Sentry-конфигурация |
| Integration (SQLite) | 153 | Полный HTTP-стек: auth, статьи, история поисков, сброс пароля, RT-жизненный цикл, seeder endpoint, observability/Sentry capture |
| Integration (PG) | 23 | Конкурентность `pg_advisory_xact_lock`; требует `DATABASE_TEST_URL` (throwaway PG, никогда не Supabase) |
| E2E (Staging) | — | Реальный Railway + Supabase staging; пропускается без `E2E_BASE_URL` |

**Фронтенд:** 799 тестов (`Vitest` + Testing Library), все зелёные; покрытие statements 86.2% (порог: 85%).

<details>
<summary>Запуск тестов</summary>

```bash
# Backend — только SQLite (быстро, без PostgreSQL)
uv run pytest tests/ -m "not requires_pg"

# Backend — все тесты (требуется DATABASE_TEST_URL → throwaway PG)
uv run pytest tests/

# Frontend
cd frontend && npm run test
```

</details>

---

## Производительность

Для нагрузочного тестирования критичных read-only эндпоинтов (полнотекстовый поиск,
`journal-impact` статистика) используется [k6](https://k6.io/).

**Методология.** Прогон — на изолированной одноразовой Postgres, никогда не на общем Supabase
(нагрузочному тесту нечего делать в его трафике). Засеяна в масштабе продакшна через разовое
чтение-копирование `articles` + `catalog_articles` из прода (без таблиц пользователей/auth — там
реальный PII, их не трогали). `DB_ECHO=false` и `DB_POOL_SIZE`/`DB_MAX_OVERFLOW` под целевую
конкурентность (оба конфигурируются через `.env`, см. `.env.example`) — иначе измерение тонет в
собственном SQL-echo-логировании и очереди на пул соединений, а не отражает приложение.

**Baseline (142 658 статей, 20 VU, изолированная Postgres, 2026-07-09):**
*   **Цель:** `P(95) < 500мс`, `P(99) < 1000мс`, `rate(errors) < 1%`.
*   **Первое честное измерение:** пороги не пройдены — `P(95) = 11.89с`, `P(99) = 13.39с`, но
    **0% ошибок** (ни одного тайм-аута или упавшего запроса — чистая очередь, а не артефакты
    пула-соединений/сети из более ранней, баганной попытки). Root cause подтверждён
    `EXPLAIN ANALYZE`: оба эндпоинта скатывались в полный параллельный seq scan — ни одному не
    подходил ни один существующий индекс под фактическую форму запроса: `title ILIKE '%term%' OR
    author ILIKE '%term%'` (ведущий wildcard отключает любой btree, включая существующие
    `ix_articles_lower_*`) и `EXTRACT(year FROM publication_date) <= max_year` (функция над
    колонкой тоже отключает индексацию). По отдельности оба — доли секунды, незаметно в браузере;
    при 20 конкурентных VU параллельные воркеры каждого запроса конкурировали за CPU-ядра
    контейнера — именно эта очередь, а не стоимость одного запроса, давала многосекундный хвост.
*   **Исправлено за 3 измеренных шага, от дешёвого к дорогому** (полное обсуждение trade-off'ов —
    GiST vs GIN, sargable-предикаты vs функциональные индексы — в `docs/project_context`):
    1. Кап точного `COUNT(*)` на 2000 (`SELECT count(*) FROM (... LIMIT 2001) t` — планировщик
       прерывает скан, как только нашёл кап, независимо от реальной селективности термина) +
       честное «2000+» вместо ложно-точного числа. → `P(95) = 10.03с`, `P(99) = 12.36с` —
       реально, но скромно: сам скан поиска оставался узким местом, кап убрал только лишнюю
       стоимость самого COUNT.
    2. `pg_trgm` **GiST**-индекс на `title`/`author` (не GIN — дешевле на запись под bulk-паттерн
       сидера, не требует внимания к pending-buffer/autovacuum; чуть дороже на чтение и требует
       recheck строк). → `P(95) = 1.74с`, `P(99) = 2.37с`.
    3. Sargable-переписывание year-фильтра (`publication_date < make_date(max_year+1,1,1)` вместо
       `EXTRACT(year FROM ...)`) + обычный btree на `publication_date`. → **`P(95) = 632мс`,
       `P(99) = 1.06с`.**
*   **Итог:** ~19x к P95, ~13x к P99 относительно первого честного измерения. Пороги пройдены не
    полностью — P99 промахивается на 60мс — но приложение теперь заметно масштабируется, и цена/
    выгода каждого шага измерена и задокументирована, а не предположена.
*   **Команда запуска baseline:**
    ```bash
    docker run --rm --network host -i grafana/k6 run - < tests/load/baseline.js
    ```
    *(требуется бэкенд на `http://localhost:8000`, направленный на изолированную БД, засеянную в масштабе продакшна)*

---

## Локальный запуск

<details>
<summary>Backend через Docker Compose</summary>

```bash
docker compose up --build
```

API: `http://localhost:8000` · Swagger: `http://localhost:8000/docs`

</details>

<details>
<summary>Backend без Docker</summary>

```bash
# Требуется uv (https://docs.astral.sh/uv/)
uv sync
# Настройте .env на основе .env.example
uv run alembic upgrade head
uv run uvicorn app.main:app --reload
```

API: `http://localhost:8000` · Swagger: `http://localhost:8000/docs`

</details>

<details>
<summary>Frontend</summary>

```bash
cd frontend
npm install
npm run dev
# http://localhost:5173
```

Переменные окружения фронтенда задаются в `frontend/.env.local`:
```
VITE_API_BASE_URL=http://localhost:8000
VITE_SENTRY_DSN=https://<key>@<org-id>.ingest.<region>.sentry.io/<project-id>
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
| `OPENROUTER_API_KEY` | API-ключ OpenRouter (генерация фраз сидера + AI-конструктор таблиц) |
| `OPENROUTER_NL_PIVOT_MODEL` | Модель OpenRouter для разбора NL-запросов Table Builder (платный тариф; дефолт временный, калибруется по трафику) |
| `NL_PIVOT_USER_DAILY_LIMIT` / `NL_PIVOT_GLOBAL_DAILY_LIMIT` | Дневной лимит запросов к AI-конструктору — на пользователя / суммарно (через Redis; значения временные) |
| `BREVO_API_KEY` | API-ключ Brevo для транзакционной почты (сброс пароля) |
| `FROM_EMAIL` | Адрес отправителя для Brevo |
| `UPSTASH_REDIS_REST_URL` | HTTPS-эндпоинт Upstash Redis (кэш stats; опционально) |
| `UPSTASH_REDIS_REST_TOKEN` | REST API-токен Upstash Redis (опционально) |
| `SENTRY_DSN` | DSN backend-проекта Sentry (ошибки + tracing; опционально, без него SDK неактивен) |
| `SENTRY_TRACES_SAMPLE_RATE` | Доля performance-трейсинга Sentry, 0.0-1.0 (по умолчанию 1.0) |

> **Перед публикацией** проверьте `.env.example` и README на реальные домены, email-адреса и токены — замените на нейтральные placeholders.

</details>
