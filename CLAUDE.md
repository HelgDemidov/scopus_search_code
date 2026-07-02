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
`app/core/`       — dependencies.py (DI + advisory lock factory + `get_email_service`), security.py (JWT/hashing), refresh_token_utils.py, cookie_constants.py, password_reset_utils.py
`app/models/`     — SQLAlchemy ORM; `app/schemas/` — Pydantic v2; `app/utils/db_utils.py`
`tests/conftest.py` — shared fixtures (SQLite in-memory); `tests/unit/` mocked; `tests/integration/` SQLite or PG
`frontend/`       — React SPA; see frontend/CLAUDE.md for details

## Commands (repo root, WSL2)
```bash
uv run ruff check app tests && uv run mypy app
uv run pytest -m "not requires_pg"   # unit + SQLite integration (CI job 'test')
uv run pytest -m requires_pg         # PG 16; нужен DATABASE_TEST_URL (throwaway, НЕ Supabase)
rg "pattern" app/                    # ripgrep — не grep; -t py для .py; -l для имён файлов
```
Frontend: `cd frontend && npm run test / lint / build`

## MCP-серверы (Claude Code, user-scope, `claude mcp list`)
Базовые: `github`, `supabase`, `railway`, `claude.ai Vercel`, `sequential-thinking`, `memory`.
Добавлены 2026-07-02:
- `context7` (`@upstash/context7-mcp`) — актуальная документация быстро меняющихся зависимостей (SQLAlchemy 2.x async, Pydantic v2, FastAPI, shadcn/ui, Vite) вместо устаревших знаний из обучения
- `chrome-devtools` (`chrome-devtools-mcp`) — вождение/дебаг настоящего Chrome для фронтенд-QA (performance-трейсы, Core Web Vitals, network/console); по умолчанию поднимает отдельный профиль Chrome, к уже открытому окну можно подключиться через `--browserUrl` (Chrome с `--remote-debugging-port`)
- `upstash` (`@upstash/mcp-server`, нужен account-level API key, отдельный от `UPSTASH_REDIS_REST_TOKEN`) — управление базой `scopus-cache` напрямую (бэкапы, статистика, raw Redis-команды)

## Permissions allowlist (`.claude/settings.json`, добавлено 2026-07-02)
Project-scope, коммитится в репо (не путать с личным `.claude/settings.local.json`, который менять этим списком не нужно).
Read-only allowlist: `uv run ruff check *`, `uv run mypy *`, `uv run pytest -m "not requires_pg"`, `cd frontend && npm run test/lint/build`.
`rg` и `git status` туда не добавлялись — уже в базовом auto-allow Claude Code. `uv run pytest -m requires_pg` намеренно не в allowlist — делает `drop_all` на PG-контейнере, не read-only.

## Python conventions
- Python 3.12; ruff E,F,I; line-length=115; target-version=py312; alembic/ excluded в pyproject.toml
- Code comments in Russian, use е (not ё); Pydantic v2 validators; SQLAlchemy 2.x async with `session.begin()`
- Advisory locks: `engine.execution_options(isolation_level="AUTOCOMMIT").connect()` — вынесено в DI `get_advisory_lock_factory()`
- Conventional commits: feat/fix/refactor/test/chore

## Scopus CQL notes
- Open Access фильтр: `OPENACCESS(1)` / `NOT OPENACCESS(1)` — **не** `OA(1)` (Scopus API отвергает с 400).
  Проверено прямым запросом к API 2026-06-25. Файл: `app/infrastructure/scopus_client.py`.
- DOI-фильтр: `ScopusHTTPClient.search()` пропускает статьи без `prism:doi` на этапе парсинга (commit `62d1d13`). Коллекция содержит **только DOI-индексированные статьи**.

## Auth & security (auth-refactoring, merged 2026-06-26)
- AT хранится **только in-memory** (Zustand + `tokenStore.ts`) — не localStorage; гидрация только через `POST /auth/refresh`
- Cookie-константы: `app/core/cookie_constants.py` (RT_COOKIE_NAME, RT_COOKIE_MAX_AGE, AT_HANDSHAKE_COOKIE_NAME)
- RT cleanup piggyback: `cleanup_stale_tokens()` вызывается при каждой ротации в `/auth/refresh`
- Password reset: `POST /auth/password-reset` + `POST /auth/password-reset/confirm`; токены в таблице `password_reset_tokens` (migration 0011); после confirm — `revoke_all_user_tokens()`
- Email: `IEmailService` ABC → `BrevoEmailService` (httpx, `api.brevo.com/v3/smtp/email`). **Railway блокирует SMTP порты 587/465 — никогда не использовать aiosmtplib/SMTP на Railway.** Env var: `BREVO_API_KEY` + `FROM_EMAIL`.
- Alembic head: `0014_functional_indices_lower`

## Do NOT
- Sync SQLAlchemy calls in async routes. Hardcoded secrets. CommonJS in frontend.
- Bare `except:` — только конкретные типы. Pydantic v1 syntax в FastAPI схемах.
- SMTP/aiosmtplib на Railway (порт 587 заблокирован). Использовать Brevo REST API (httpx).

## DB & env-var map (critical)
Two Supabase instances: production (`btmiovdmasqufufyuokx`) and staging (`gpbymgvkqtiueoyborrw`).
```
DATABASE_URL (local .env)     → production Supabase  (uvicorn locally)
DATABASE_URL (e2e CI env)     → staging Supabase     (из секрета DATABASE_SUPABASE_STAGING_URL)
DATABASE_TEST_URL             → throwaway PG container — NEVER point at Supabase (tests do drop_all)
```
GitHub Secret `DATABASE_URL` удалён. `e2e.yml` задаёт `DATABASE_URL` из `${{ secrets.DATABASE_SUPABASE_STAGING_URL }}`.

## Redis (Upstash) — кэш stats (PR #32, merged 2026-06-27)
`UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` — Upstash Redis (HTTPS REST, порт 443).
Хранятся в: локальный `.env`, Railway Variables (prod + staging), GitHub Secrets.
Cache-aside в `CatalogService.get_stats()` (TTL=60s); `app/infrastructure/redis_client.py` — синглтон.
Graceful degradation: переменные не заданы → `redis_client=None` → прямой запрос к БД.
`SET LOCAL work_mem='32MB'` в `postgres_catalog_repo.get_stats()` — только при `dialect=="postgresql"`.
Тесты: `FakeRedis` in-memory дублёр, реальный Upstash в CI не используется.

## Test layers & CI
```
tests/unit/ + tests/integration/ (no marker) → CI job 'test'    (SQLite)
tests/integration/ requires_pg              → CI job 'test-pg' (PG 16)
tests/integration/*e2e*  E2E_BASE_URL       → e2e.yml          (live Railway staging)
```
CI coverage: jobs `test` + `test-pg` → combined artifacts → `coverage` fail-under=80 (текущий: ~82%).
Advisory lock в DI-фабрике → новые тесты `GET /articles/find` не требуют `requires_pg`; только `test_find_articles_postgres.py` (конкурентность).

### Полная матрица CI-джобов (2026-06-26)
| Воркфлоу | Джоб | Что проверяет | Триггер |
|---|---|---|---|
| `tests.yml` | `test` | pytest SQLite, not requires_pg | push+PR → main |
| `tests.yml` | `test-pg` | alembic upgrade+check; pytest PG requires_pg | push+PR → main |
| `tests.yml` | `quality` | ruff check+format, mypy, pip-audit | push+PR → main |
| `tests.yml` | `coverage` | combined 80% threshold | после test+test-pg |
| `frontend-tests.yml` | `typecheck` | tsc --noEmit | push main (paths: frontend/**) |
| `frontend-tests.yml` | `lint` | ESLint --max-warnings 0; npm audit --audit-level=high | push main |
| `frontend-tests.yml` | `unit` | vitest unit-тесты | push main |
| `frontend-tests.yml` | `integration` | vitest integration + coverage (все 370 тестов; threshold statements=70%) | push main |
| `frontend-tests.yml` | `build` | npm run build (Vite production) | push main |
| `e2e.yml` | `e2e` | smoke-тесты против Railway staging | push main |

**Branch protection (main, 2026-06-26):** force push запрещён; удаление запрещено; required checks для PR: `test`, `test-pg`, `Code quality (ruff + mypy + pip-audit)` (strict: ветка должна быть актуальна с main). enforce_admins=false — прямой пуш owner'а работает.
**Dependabot:** `.github/dependabot.yml` — pip + npm + github-actions, еженедельно по понедельникам, limit=3 PR на экосистему.

## Migration chain note
`seeder_keywords` NOT в `Base.metadata` в рантайме → drop_all её не трогает. В alembic/env.py SeederKeyword импортируется явно для автогенерации.
Chain: `f9a3c1e2b7d4` → `0010` → `0011` → `0012` → `0013_fix_schema_drift` → `0014_functional_indices_lower` (head).
Миграция 0014: функциональные индексы `lower(affiliation_country)` и `lower(document_type)` — применена на prod + staging 2026-06-27.
`alembic/env.py`: `include_object` хук исключает expression-индексы из autogenerate — без него `alembic check` видит их как "лишние" и хочет удалить (SQLAlchemy рефлектит как `_textual_index_element`).
