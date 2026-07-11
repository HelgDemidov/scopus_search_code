# Scopus Search — Claude Code memory

## Project overview
REST API (FastAPI + asyncpg + SQLAlchemy 2.x async) + React 18/TypeScript SPA (Vite + shadcn/ui + Tailwind 3).
Architecture: SOLID, layered — `app/interfaces` → `app/services` → `app/infrastructure` → `app/routers`.
Backend deploys to Railway (Docker); frontend to Vercel. DB — PostgreSQL (Supabase in production).
App config: `app/config.py` (Pydantic Settings).

## Backend layers & key files
`app/interfaces/` — ABCs: article/catalog/search_history/search_result/user repositories + search_client + `email_service.py` (IEmailService)
`app/services/`   — business logic: search, search_history, catalog, article, user
`app/infrastructure/` — Postgres repos, scopus_client (CQL-builder), database, `redis_client.py` (Upstash REST)
`app/routers/`    — FastAPI handlers: articles, auth, users, health, seeder_router
`app/core/`       — dependencies.py (DI + advisory lock factory + `get_email_service`), security.py (JWT/hashing), refresh_token_utils.py, cookie_constants.py, password_reset_utils.py, sentry_config.py (`configure_sentry()`)
`app/models/`     — SQLAlchemy ORM; `app/schemas/` — Pydantic v2; `app/utils/db_utils.py`
`tests/conftest.py` — shared fixtures (SQLite in-memory); `tests/unit/` mocked; `tests/integration/` SQLite or PG
`frontend/`       — React SPA; see frontend/CLAUDE.md for details

## Commands (repo root, WSL2)
```bash
uv run ruff check app tests && uv run ruff format --check app tests && uv run mypy app
uv run pytest -m "not requires_pg"   # unit + SQLite integration (CI job 'test')
uv run pytest -m requires_pg         # PG 16; нужен DATABASE_TEST_URL (throwaway, НЕ Supabase)
rg "pattern" app/                    # ripgrep — не grep; -t py для .py; -l для имён файлов
```
Frontend: `cd frontend && npm run test / lint / build`

## MCP-серверы (Claude Code, user-scope, `claude mcp list`)
Базовые: `github`, `supabase`, `railway`, `claude.ai Vercel`, `sequential-thinking`, `memory`. Добавлены 2026-07-02: `context7` (документация зависимостей), `chrome-devtools` (вождение/дебаг Chrome для фронтенд-QA; `--browserUrl` для подключения к уже открытому окну), `upstash` (управление Upstash Redis напрямую, нужен account-level ключ).

## Permissions allowlist (`.claude/settings.json`, добавлено 2026-07-02)
Project-scope (не путать с личным `.claude/settings.local.json`). Read-only allowlist: `uv run ruff check *`, `uv run ruff format --check *`, `uv run mypy *`, `uv run pytest -m "not requires_pg"`, `cd frontend && npm run test/lint/build`. `rg`/`git status` уже в базовом auto-allow; `pytest -m requires_pg` намеренно не в списке — делает `drop_all` на PG-контейнере, не read-only.

## Python conventions
- Python 3.12; ruff E,F,I; line-length=115; target-version=py312; alembic/ excluded в pyproject.toml
- Code comments in Russian, use е (not ё); Pydantic v2 validators; SQLAlchemy 2.x async with `session.begin()`
- Advisory locks: `engine.execution_options(isolation_level="AUTOCOMMIT").connect()` — вынесено в DI `get_advisory_lock_factory()`
- Conventional commits: feat/fix/refactor/test/chore

## Scopus CQL notes
- Open Access фильтр: `OPENACCESS(1)`/`NOT OPENACCESS(1)` — **не** `OA(1)` (Scopus API отвергает с 400, проверено 2026-06-25). Файл: `app/infrastructure/scopus_client.py`.
- DOI-фильтр: `ScopusHTTPClient.search()` пропускает статьи без `prism:doi` на этапе парсинга (commit `62d1d13`). Коллекция содержит **только DOI-индексированные статьи**.

## Auth & security (auth-refactoring, merged 2026-06-26)
- AT хранится **только in-memory** (Zustand + `tokenStore.ts`) — не localStorage; гидрация только через `POST /auth/refresh`
- Cookie-константы: `app/core/cookie_constants.py` (RT_COOKIE_NAME, RT_COOKIE_MAX_AGE, AT_HANDSHAKE_COOKIE_NAME)
- RT cleanup piggyback: `cleanup_stale_tokens()` вызывается при каждой ротации в `/auth/refresh`
- Password reset: `POST /auth/password-reset` + `POST /auth/password-reset/confirm`; токены в таблице `password_reset_tokens` (migration 0011); после confirm — `revoke_all_user_tokens()`
- Email: `IEmailService` ABC → `BrevoEmailService` (httpx, `api.brevo.com/v3/smtp/email`). **Railway блокирует SMTP порты 587/465 — никогда не использовать aiosmtplib/SMTP на Railway.** Env var: `BREVO_API_KEY` + `FROM_EMAIL`.

## Do NOT
- Sync SQLAlchemy calls in async routes. Hardcoded secrets. CommonJS in frontend. Bare `except:` — только конкретные типы. Pydantic v1 syntax в FastAPI схемах.
- SMTP/aiosmtplib на Railway (порт 587 заблокирован). Использовать Brevo REST API (httpx).

## DB & env-var map (critical)
Two Supabase instances: production (`btmiovdmasqufufyuokx`), staging (`gpbymgvkqtiueoyborrw`). `DATABASE_URL` → production Supabase локально (uvicorn) / staging Supabase в e2e CI (из секрета `DATABASE_SUPABASE_STAGING_URL`). `DATABASE_TEST_URL` → throwaway PG-контейнер, НИКОГДА не Supabase (тесты делают `drop_all`). GitHub Secret `DATABASE_URL` удалён (раньше указывал на staging, конфликтовал с локальным `.env`).

## Redis (Upstash) — кэш stats (PR #32, merged 2026-06-27)
`UPSTASH_REDIS_REST_URL`/`TOKEN` — Upstash Redis REST (HTTPS 443); в `.env`, Railway (prod+staging — **одна физическая инстанция**, не как раздельные Supabase-БД), GitHub Secrets.
Cache-aside в `CatalogService.get_stats()` (TTL=60s, `redis_client.py` — синглтон); graceful degradation → `redis_client=None` → прямой запрос к БД.
Ключ кэша обязательно включает `db_namespace` (sha256 от `DATABASE_URL`, инжектится через DI в `get_catalog_service()`) — иначе prod/staging делят один Redis-ключ (баг 2026-07-02: `e2e.yml` на каждый push освежал общий ключ staging-данными, прод на 60с показывал staging-статистику вместо своей).
`SET LOCAL work_mem='32MB'` в `postgres_catalog_repo.get_stats()` — только `dialect=="postgresql"`. Тесты: `FakeRedis` in-memory дублёр, реальный Upstash в CI не используется.
Публичные `/stats/journal-impact` и `/stats/pivot` (Table Builder/Journal Landscape, PR #44, merged 2026-07-03) изначально были задуманы **некэшируемыми** (runtime-параметризованные, в отличие от `/stats`); `_ALLOWED_PIVOT_PAIRS` whitelist в `app/routers/articles.py` — defense-in-depth от SQL-инъекции поверх Literal-типизации `PivotDimension`. Пересмотрено 2026-07-10: `/stats/journal-impact` кэшируется (TTL=60s, `make_journal_impact_cache_key`) — слайдер `max_year` всего на 3 значения (2022-2024), в отличие от комбинаторного пространства `/stats/pivot` (осталось некэшируемым). Медиана в `get_journal_impact` теперь считается через `percentile_cont` на Postgres (SQLite в тестах — прежний Python-фолбэк).

## Personal search data (PR #45, merged 2026-07-04; расширено PR #46, merged 2026-07-05)
`search_history` тримится до `SearchHistoryService.HISTORY_DEPTH_LIMIT=100`/юзер бесшовно внутри `SearchService.find_and_save` (`ISearchHistoryRepository.trim_to_last_n(user_id, n, keep_since)`, между `insert_row` и `save_results`). `keep_since` обязателен: `HISTORY_DEPTH_LIMIT(100) < QUOTA_LIMIT(200)` за то же 7-дневное окно — без него retention занижает `count_in_window()`, недельная квота Scopus становится недостижимой. `find_and_save` пишет `search_history` (`result_count=0`) даже при 0 статьях от Scopus — раньше ранний `return []` до `insert_row` терял 0-result поиски из истории и квоты (баг с первого коммита, пофикшен 2026-07-06). `GET /articles/stats/personal` и `GET /articles/stats/personal/activity` (оба JWT, без кэша) — источники `/explore?mode=personal` (KPI/Drawer + `PersonalActivityChart`/`FilterFingerprintStrip`, авто-грануляция week/month по 70-дневному порогу). `/profile` — просмотр статей прошлого поиска через `GET /articles/history/{id}/results`.

**GC статей-сирот** (issue #47, реализовано 2026-07-06 прямым коммитом в main): CASCADE-удаление `search_result_articles` при retention-trim может оставить статью в `articles` без единой ссылки. `IArticleRepository.delete_orphaned()` (`postgres_article_repo.py`) удаляет только строки, отсутствующие одновременно в `search_result_articles` И `catalog_articles` (коррелированный `NOT EXISTS` × 2 — обязательны обе проверки: `catalog_articles.article_id` имеет `ondelete=CASCADE`, ложное удаление стёрло бы реальный каталог). Эндпоинт `POST /seeder/gc` (тот же `X-Seeder-Secret`, что `/seeder/seed`) вызывается сидером (`seed_db.py`) один раз в конце каждого прогона — piggyback на существующий 2-часовой cron, отдельная джоба не заводилась.

**Observability без внешних сервисов** (issue #48, merged 2026-07-06, ветка `feat/observability` без PR): structured JSON logging (`structlog`, `app/core/logging_config.py`) + `RequestIDMiddleware` — `request_id` через contextvars, тот же id в заголовке `X-Request-ID` и в каждой строке лога запроса. Global exception handler (`app/main.py`) логирует необработанные исключения как ERROR с traceback, клиенту — только generic 500 (`request_id` в этом пути читается из `structlog.contextvars` напрямую — `ServerErrorMiddleware` стоит выше `RequestIDMiddleware` в стеке). `GET /health/redis` (доп. к `/health`, `/health/db`) + `POST /seeder/health-check` — piggyback на seeder cron: при деградации БД/Redis шлёт письмо через `BrevoEmailService.send_alert_email()` (новый метод `IEmailService`). Осознанно без Sentry/OTel на тот момент — решение пересмотрено в PR #63 (см. ниже). Известный пробел: `X-Request-ID` не отображается пользователю на фронтенде — кандидат в следующий тикет.

## Test layers & CI
```
tests/unit/ + tests/integration/ (no marker) → CI job 'test'    (SQLite)
tests/integration/ requires_pg              → CI job 'test-pg' (PG 16)
tests/integration/*e2e*  E2E_BASE_URL       → e2e.yml          (live Railway staging)
```
CI coverage: jobs `test` + `test-pg` → combined artifacts → `coverage` fail-under=80 (текущий: 81%, PR #45).
Advisory lock в DI-фабрике → новые тесты `GET /articles/find` не требуют `requires_pg`; только `test_find_articles_postgres.py` (конкурентность).

### Полная матрица CI-джобов (2026-06-26)
| Воркфлоу | Джобы | Триггер |
|---|---|---|
| `tests.yml` | `test` (SQLite), `test-pg` (PG16 + alembic check), `quality` (ruff/mypy/pip-audit), `coverage` (80%, после test+test-pg) | push+PR → main |
| `frontend-tests.yml` | `typecheck`, `lint` (ESLint + npm audit), `unit`, `integration` (threshold 70%), `build` | push main (paths: frontend/**) |
| `e2e.yml` | `e2e` — smoke-тесты против Railway staging | push main |

**Branch protection (main):** force push и удаление запрещены; required checks для PR: `test`, `test-pg`, `Code quality` (strict). enforce_admins=false — прямой пуш owner'а работает.
**Dependabot:** `.github/dependabot.yml` — pip + npm + github-actions, еженедельно, limit=3 PR на экосистему.

## Migration chain note
`seeder_keywords` NOT в `Base.metadata` в рантайме → drop_all её не трогает; alembic/env.py импортирует SeederKeyword явно для автогенерации.
Chain: `f9a3c1e2b7d4` → `0010` → `0011` → `0012` → `0013_fix_schema_drift` → `0014_functional_indices_lower` → `0015_trim_search_history_over_limit` → `0016_trgm_gist_search_indices` → `0017_publication_date_index` (head, PR #58; оба — `CREATE INDEX CONCURRENTLY`, применены и на staging Supabase, прод получит при следующем деплое через `entrypoint.sh`).
`alembic/env.py`: `_MIGRATION_ONLY_INDICES` (переименовано из `_FUNCTIONAL_INDICES`, PR #58) исключает из autogenerate индексы, не воспроизводимые structural-сравнением с ORM-моделью — expression-индексы (`lower(...)`) и GiST/operator-class (`gist_trgm_ops`); без него `alembic check` считает их «лишними».

## Catalog search performance (feedback pts 4-5, PR #58, merged 2026-07-09)
`GET /articles/` пагинация: точный `COUNT(*)` капается на `CatalogService.TOTAL_COUNT_CAP=2000` (подзапрос `LIMIT cap+1` — full scan на широких ILIKE-фильтрах иначе доминирует над стоимостью запроса); `PaginatedArticleResponse.total_is_capped` — контракт не искажает число молча, фронт показывает «2000+». `pg_trgm` GiST (не GIN — дешевле на запись под bulk-апдейты сидера раз в 2ч) на `articles.title`/`author` под ILIKE; sargable-предикат вместо `extract(year FROM publication_date)` в `get_journal_impact` + btree на `publication_date`. `DB_ECHO`/`DB_POOL_SIZE`/`DB_MAX_OVERFLOW` — конфигурируемы через `.env` (`app/config.py`), дефолты сохраняют прежнее поведение. Честный k6-прогон на прод-масштабной (142k статей) копии — `tests/load/baseline.js`; полная методология и прогрессия P95/P99 по шагам (11.89s → 632ms) в `docs/project_context/scopus-search-feedback-2026-07-03.md`.

## Impact Analytics (PR #62, merged 2026-07-11)
`GET /stats/pivot` — новый query-param `metric` (`count`|`avg_citations`, default `count`); `PivotResponse.matrix` теперь `float` (JSON/JS не различает 42 и 42.0), `cell_counts` — новое поле, ВСЕГДА article count независимо от `metric` (источник правды для sparse-детекции и "нет статей" vs "avg=0"). Top-N отбор строк/столбцов Table Builder остаётся по `count` независимо от metric. `StatsResponse.country_impact` — топ-20 стран × `avg(cited_by_count)`, встроено в уже кэшируемый `get_stats()` (не отдельный эндпоинт, в отличие от `journal-impact` — здесь нет рантайм-параметра/слайдера); без медианы и без PG/SQLite-ветвления — top-N по объёму убирает риск "выброс с N=1 наверху".

## Observability: Sentry (PR #63, merged 2026-07-11)
Backend (`sentry-sdk`, `app/core/sentry_config.py:configure_sentry()`) + frontend (`@sentry/react`, `frontend/src/sentry.ts:initSentry()`) — errors + performance tracing (`traces_sample_rate=1.0`, Developer-план даёт 5M spans/мес). Один Sentry-проект на backend/frontend (не на окружение) — prod/staging различаются тегом `environment` (backend: `RAILWAY_ENVIRONMENT_NAME`, авто от Railway; frontend: `import.meta.env.MODE`). `send_default_pii=False` на обоих SDK **не защищает `url.full`** (проверено по исходникам SDK) — явный `before_send`/`beforeSendTransaction`/`beforeBreadcrumb` scrub query-string (реальные секреты в URL: `/reset-password?token=...`, `GET /auth/google/callback?code=...`). Явный `capture_exception()`/`captureException()` во всех catch-точках (backend global handler; frontend — 3 error boundary + API-interceptor) — не полагаемся на автоинструментацию SDK поверх кастомного `exception_handler(Exception)`. `request_id` — Sentry-тег на обоих концах, коррелирует с structured-логами (issue #48). Source maps фронтенда — `@sentry/vite-plugin`, условно по `SENTRY_AUTH_TOKEN` (Vercel Production only): `sourcemap:'hidden'` + `filesToDeleteAfterUpload`, исходники не публикуются в `dist/`. `tests/conftest.py` форсирует `SENTRY_DSN=""` до импорта `app.main` — иначе тестовые прогоны шлют события в прод-Sentry (найдено эмпирически, все SDK читают `.env` напрямую через `pydantic-settings`, `os.environ.pop` не маскирует значение из файла). CSP `connect-src` (`frontend/vercel.json`) должен явно включать Sentry ingest-домен (`https://<org-id>.ingest.<region>.sentry.io`) — иначе браузер блокирует исходящие события при полностью корректной настройке SDK (найдено пост-мердж живой проверкой в браузере, прямой коммит в `main`).
