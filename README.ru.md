# Scopus Search API

[![Backend Tests](https://github.com/HelgDemidov/scopus_search_code/actions/workflows/tests.yml/badge.svg)](https://github.com/HelgDemidov/scopus_search_code/actions/workflows/tests.yml)
[![Frontend Tests](https://github.com/HelgDemidov/scopus_search_code/actions/workflows/frontend-tests.yml/badge.svg)](https://github.com/HelgDemidov/scopus_search_code/actions/workflows/frontend-tests.yml)

Версия на английском: [README.md](README.md)

**Scopus Search API** — production fullstack-сервис для поиска, накопления и визуализации научных публикаций. В основе — интеграция с глобальной базой [Elsevier Scopus](https://www.scopus.com/). Сервис работает в двух режимах: **публичный поиск** по тематической коллекции «AI & Neural Network Technologies» (доступен без регистрации) и **live-поиск** по всей базе Scopus (требует авторизации).

---

## Возможности

| Режим | Функциональность |
|---|---|
| **Без авторизации** | Просмотр и поиск тематической коллекции «AI & Neural Network Technologies» (~227 400 публикаций); многокритериальная фильтрация по году, стране, типу документа и статусу open access; детальные страницы статей; интерактивный аналитический дашборд (/explore) с cross-filter графиками, конструктором pivot-таблиц Table Builder (метрика — количество или среднее число цитирований), Journal Landscape scatter, и статистикой по трендам, географии, типам документов, ведущим журналам, авторам и ключевым словам |
| **С авторизацией** | Все возможности без авторизации плюс: live-поиск по всей базе Scopus (до 25 результатов за запрос); личная история поисков с фильтрацией и персональная аналитика (/explore?mode=personal); счётчик недельной квоты API; управление аккаунтом (email/пароль · Google OAuth · сброс пароля по email) |

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
| **Кэш** | Upstash Redis (HTTPS REST, TTL 60 с) — cache-aside для `/articles/stats`, `/stats/journal-impact` и счётчика пагинации каталожного поиска | Upstash |
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
├── models/           # SQLAlchemy ORM-модели (8 таблиц)
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
├── stores/           # articleStore, authStore, historyStore, quotaStore, statsStore,
│                     #   dashboardStore, blackHoleStore, tokenStore (AT in-memory, без localStorage)
├── pages/            # MainPage, SearchPage, ExplorePage, ProfilePage, AuthPage, ArticlePage,
│                     #   About/Privacy/TermsPage, OAuthCallback, Forgot/ResetPasswordPage,
│                     #   error/ (NotFoundPage, RouteErrorPage)
├── components/       # articles/, charts/, layout/, profile/, search/, ui/
├── hooks/            # usePagination + ещё 8 (тема, media query, i18n-роутинг/hreflang,
│                     #   цвета измерений дашборда, позиционирование чёрной дыры)
└── types/            # TypeScript-типы и интерфейсы API
```

---

## API эндпоинты

### Публичные

| Метод | Путь | Описание |
|---|---|---|
| `GET` | `/articles/` | Пагинированный список каталога; поиск по ключевому слову / полнотекстовый + многокритериальная фильтрация (диапазон лет, страна, тип документа, open access) |
| `GET` | `/articles/stats` | Агрегированная статистика коллекции (по годам, журналам, странам, типам) |
| `GET` | `/articles/stats/journal-impact` | Journal Landscape scatter (объём × среднее цитирование, по окну max-year) |
| `GET` | `/articles/stats/pivot` | Table Builder — 2D pivot (пара измерений строка/столбец, метрика count или avg-citations) |
| `GET` | `/articles/{id}` | Детальная страница статьи |
| `GET` | `/health` | Health-check (только живость процесса) |
| `GET` | `/health/db` | Health-check — доступность базы данных |
| `GET` | `/health/redis` | Health-check — доступность Redis (`not_configured`, если не настроен — не ошибка) |

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
| `GET` | `/articles/history/{id}/results` | Статьи из конкретного прошлого поиска |
| `GET` | `/articles/search/stats` | Агрегаты по статьям из личных поисков |
| `GET` | `/articles/stats/personal` | Персональная KPI-статистика (та же форма, что `/articles/stats`, но по своим поискам) |
| `GET` | `/articles/stats/personal/activity` | Лента активности (авто week/month granularity) для `/explore?mode=personal` |

### Внутренние (service-to-service, заголовок `X-Seeder-Secret`, не JWT пользователя)

| Метод | Путь | Описание |
|---|---|---|
| `POST` | `/seeder/seed` | Засеять результаты Scopus по одному ключевому слову в каталог |
| `POST` | `/seeder/gc` | Удалить осиротевшие строки `articles`, оставшиеся после обрезки retention |
| `POST` | `/seeder/health-check` | Проверка доступности БД/Redis; email-алерт через Brevo при деградации |

<details>
<summary>Квота и конкурентный доступ</summary>

Лимит — **200 live-поисков / 7 дней** (скользящее окно) на пользователя. При превышении — HTTP 429, Scopus не вызывается, запись в историю не создаётся.

Для защиты от гонок при параллельных запросах применяется `pg_advisory_xact_lock(user_id)` — блокировка берётся до проверки счётчика и снимается вместе с транзакцией. Это гарантирует корректную обработку даже при одновременных обращениях.

Заголовки Scopus Rate Limit (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`) проксируются в ответ фронтенду.

</details>

---

## База данных

Актуальная версия миграций: `0018_trgm_gin_indices`.

| Таблица | Назначение | Записей (prod) |
|---|---|---|
| `articles` | Нормализованный реестр публикаций Scopus | ~228 300 |
| `catalog_articles` | Принадлежность статей к тематической коллекции (keyword сидера) | ~227 400 |
| `search_history` | История live-поисков пользователей (JSONB `filters`) | ~110 |
| `search_result_articles` | Junction-таблица: поиск → статьи с `rank` | ~2 370 |
| `seeder_keywords` | Использованные фразы сидера с кластерами и датами | ~25 700 |
| `users` | Пользователи сервиса | ~10 |
| `refresh_tokens` | Активные refresh-токены с поддержкой ротации | ~79 |
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

**Бэкенд:** 322 теста (`pytest` + `pytest-asyncio`), все зелёные, три слоя:

| Слой | Тестов | Что проверяет |
|---|---|---|
| Unit (SQLite, мокированный) | 141 | Сервисы (article, catalog, search, user), Scopus-клиент, контракты интерфейсов, seeder router/keyword generator, Redis-кэш, Sentry-конфигурация |
| Integration (SQLite) | 155 | Полный HTTP-стек: auth, статьи, история поисков, сброс пароля, RT-жизненный цикл, seeder endpoint, observability/Sentry capture |
| Integration (PG) | 26 | Конкурентность `pg_advisory_xact_lock`, фильтрация каталога по `search=`; требует `DATABASE_TEST_URL` (throwaway PG, никогда не Supabase) |
| E2E (Staging) | — | Реальный Railway + Supabase staging; пропускается без `E2E_BASE_URL` |

**Фронтенд:** 832 теста (`Vitest` + Testing Library), все зелёные; покрытие statements 86.8% (порог: 85%).

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

<details>
<summary><strong>Методология и baseline — 11.89с → 632мс P95 за 3 измеренных шага</strong></summary>

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
    при 20 конкурентных VU полные последовательные сканы вставали в очередь за общий CPU
    контейнера — почему первоначальная гипотеза про «конкуренцию параллельных воркеров» за эту
    очередь не подтвердилась при прямой проверке, см. раздел Инженерные решения и уроки, кейс №3.
*   **Исправлено за 3 измеренных шага, от дешёвого к дорогому** (полное обсуждение trade-off'ов —
    GiST vs GIN, sargable-предикаты vs функциональные индексы — в `docs/project-meta/project_context`):
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

</details>

---

## Инженерные решения и уроки

Реальные прод-инциденты из истории этого проекта — не причёсанные кейс-стади — с конкретным фиксом и общим уроком после каждого.

<details>
<summary><strong>Прод показывал цифры staging 60 секунд — при каждом билде</strong> (PR #32)</summary>

Оба окружения делят одну физическую инстанцию Upstash Redis; ключ кэша статистики (cache-aside) был привязан только к форме запроса, но не к окружению. Каждый пуш в `main` запускал `e2e.yml` против staging, который безобидно прогревал общий ключ staging-данными — следующие 60 секунд (TTL кэша) прод-эндпоинт `/stats` отдавал реальным пользователям staging-цифры.

Пофиксили добавлением `db_namespace` (sha256 от `DATABASE_URL`) в каждый ключ кэша.

**Урок:** общая инфраструктура между окружениями требует собственной явной границы изоляции — разные базы данных не гарантируют разные ключи кэша.

</details>

<details>
<summary><strong>Ветка кода, на 100% сломанная и невидимая для своих же тестов</strong> (PR #45)</summary>

В `postgres_article_repo.py` проверка личной видимости статьи строила `EXISTS`-подзапрос через `select(sa.literal(1))`, а затем вызывала `.join(SearchHistory, ...)` — без ORM-сущности, к которой можно привязать левую сторону join, SQLAlchemy не может разрешить join и бросает исключение на любом реальном движке, не только на Postgres.

Любой залогиненный пользователь получал 500 при открытии любой своей прошлой статьи — с момента появления кода, не эпизодически и не в зависимости от данных. Единственный тест, покрывавший эту ветку, мокал репозиторий целиком и проверял только то, что `user_id` передан дальше — реальный SQL в CI ни разу не выполнялся.

Баг нашли, написав одноразовый скрипт, который вызывал репозиторий напрямую против продакшен-БД (обычный выход проекта — в тот день был сломан сам инструмент логов Railway), и воспроизвели точно тот же traceback, что и в браузере. Пофиксили явным `.select_from(SearchResultArticle)`.

**Урок:** мокнутый unit-тест может «сертифицировать» код, который ни разу не выполнил ни одного реального запроса — корректность join нужно проверять интеграционным тестом на реальном движке, пусть даже SQLite.

</details>

<details>
<summary><strong>20 минут проверки, которые избавили от тикета на слепой тюнинг GUC</strong></summary>

Изначальный отчёт о нагрузочном тесте объяснял многосекундный хвост P95 в разделе Производительность «конкуренцией параллельных воркеров каждого запроса за CPU-ядра» при 20 конкурентных VU — правдоподобная на слух гипотеза, которую никто не проверял против прода.

Read-only проверка на реальной Supabase-инстанции показала `max_parallel_workers_per_gather=1` — Supabase уже сама ограничила intra-query параллелизм ниже дефолта Postgres, то есть воркерам почти нечего было делить. Два подряд идущих одинаковых `EXPLAIN (ANALYZE, BUFFERS)`, с идентичными buffer hits и без единой другой сессии, всё равно дали разброс от 1.95с до 9.24с — реальная причина — нестабильность CPU-времени, свойственная burstable/shared compute-тиру, а не intra-query конкуренция.

Код не менялся; гипотеза была попросту неверна в заявленном виде, и формулировка root cause в разделе Производительность выше исправлена соответственно.

**Урок:** 20 минут read-only проверки против реальной инфраструктуры дешевле тикета на тюнинг GUC под непроверенную теорию.

*(Реальные прод P95/P99 из живого трафика в этот раз не собирались — инструменту логов Railway в этой сессии не хватило account-level токена; честный baseline выше остаётся тем, что измерен на выделенном инстансе прод-масштаба.)*

</details>

<details>
<summary><strong>Индексы тяжелее самих данных — и «мёртвый» индекс, который таковым не оказался</strong> (PR #81)</summary>

`GET /articles/?search=` отдавал ответ за 0.5–9.8с в зависимости от момента. `VACUUM ANALYZE` — очевидный первый шаг после роста таблицы на 60% — ничего не изменил: `EXPLAIN (ANALYZE, BUFFERS)` показал, что худший случай запроса уже был на 100% buffer cache hits, без единого чтения с диска. Стоимость была не от cache miss или устаревшей статистики — а от CPU-времени на проход по объективно переразмеренному `pg_trgm` GiST-индексу (145МБ суммарно на таблице весом 65МБ).

Реальный фикс — перевод этих двух GiST-индексов на GIN: та же семантика ILIKE-подстроки, на 65% и 53% меньше по размеру соответственно, ~30x быстрее на худшем случае запроса в прогретом состоянии (замерено на проде после деплоя). Это разворачивает более раннее осознанное решение из PR #58 («GiST, не GIN — дешевле на запись под bulk-апдейты сидера») — обосновано сейчас только потому, что сидер сейчас заморожен; трейд-офф по стоимости записи нужно переоценить до разморозки, а не после.

Один из двух индексов выглядел мёртвым грузом по одному тестовому терму (`rows=0`). Проверка 20 реальных термов вместо одного перевернула вывод: для частых фамилий авторов («wang», «zhang», «chen»...) он находит тысячи совпадений, которые поиск по title никогда бы не нашёл — выборка из одного терма была ложноотрицательной, а не реальным сигналом.

**Урок:** запрос, который уже весь на cache hits, не починить `VACUUM`/`ANALYZE` — сначала проверь `Buffers: shared hit` vs `read`, прежде чем тянуться к фиксу через обновление статистики. И никогда не делай вывод «этот индекс бесполезен» по одному тестовому терму — проверяй широко, особенно на всём, что матчит свободный текст вроде имён.

</details>

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
VITE_GA_MEASUREMENT_ID=G-XXXXXXXXXX
VITE_SUPPORT_EMAIL=support@example.com
```

</details>

<details>
<summary>Переменные окружения (.env.example)</summary>

| Переменная | Описание |
|---|---|
| `SCOPUS_API_KEY` | API-ключ Elsevier (dev.elsevier.com) |
| `DATABASE_URL` | Connection string Supabase Session Pooler (asyncpg) |
| `DB_ECHO` | Логировать каждый SQL-запрос (только для dev/debug — шумно под нагрузкой, по умолчанию `true`) |
| `DB_POOL_SIZE` / `DB_MAX_OVERFLOW` | Размер пула соединений SQLAlchemy (по умолчанию: 5 / 10) |
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
| `BREVO_API_KEY` | API-ключ Brevo для транзакционной почты (сброс пароля) |
| `FROM_EMAIL` | Адрес отправителя для Brevo |
| `UPSTASH_REDIS_REST_URL` | HTTPS-эндпоинт Upstash Redis (кэш stats; опционально) |
| `UPSTASH_REDIS_REST_TOKEN` | REST API-токен Upstash Redis (опционально) |
| `SENTRY_DSN` | DSN backend-проекта Sentry (ошибки + tracing; опционально, без него SDK неактивен) |
| `SENTRY_TRACES_SAMPLE_RATE` | Доля performance-трейсинга Sentry, 0.0-1.0 (по умолчанию 1.0) |

> **Перед публикацией** проверьте `.env.example` и README на реальные домены, email-адреса и токены — замените на нейтральные placeholders.

</details>
