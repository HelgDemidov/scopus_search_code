# Scopus Search — Claude Code memory

## Project overview
REST API (FastAPI + asyncpg + SQLAlchemy 2.x async) + React 18/TypeScript SPA (Vite + shadcn/ui + Tailwind 3).
Architecture: SOLID, layered — `app/interfaces` → `app/services` → `app/infrastructure` → `app/routers`.
Backend deploys to Railway (Docker); frontend to Vercel. DB — PostgreSQL (Supabase in production).
App config: `app/config.py` (Pydantic Settings).

## Layers & key files

`app/interfaces/` — ABCs (dependency inversion):
  article_repository, catalog_repository, search_client,
  search_history_repo, search_result_repo, user_repository

`app/services/` — business logic:
  search_service, search_history_service, catalog_service,
  article_service, user_service

`app/infrastructure/` — concrete implementations:
  postgres_article_repo, postgres_catalog_repo, postgres_search_history_repo,
  postgres_search_result_repo, postgres_user_repo, scopus_client, database

`app/routers/` — FastAPI handlers:
  articles, auth, users, health, seeder_router

`app/models/` — SQLAlchemy ORM:
  base, article, catalog_article, search_history,
  search_result_article, refresh_token, user, seeder_keyword

`app/core/`    — dependencies.py, security.py (JWT/hashing), refresh_token_utils.py
`app/utils/`   — db_utils.py
`app/schemas/` — Pydantic v2 schemas
`db_seeder/`   — standalone seeder module
`tests/conftest.py`          — shared fixtures (SQLite in-memory)
`tests/unit/`                — unit tests (mocked, no DB)
`tests/integration/`         — integration tests (SQLite или PG в зависимости от маркера)
`tests/requirements-test.txt` — test dependencies

`frontend/`    — React 18/TypeScript SPA; see frontend/CLAUDE.md for details

## Backend commands (repo root, WSL2 bash)
Менеджер пакетов — **uv** (`uv.lock` + `.venv`). `.venv` активирован автоматически в WSL2-шелле,
поэтому прямые вызовы работают. `uv run <tool>` переносимее (не зависит от активации):
```bash
uv run ruff check app tests
uv run mypy app
uv run pytest -m "not requires_pg"        # unit + SQLite integration (зеркало CI job 'test')
uv run pytest -m requires_pg             # PG 16; нужен DATABASE_TEST_URL (throwaway, НЕ Supabase)
uv run pytest tests/unit/test_X.py -v   # single file — preferred when using CLI
```
Поиск по коду — **rg** (ripgrep, установлен в `/usr/bin/rg`), не grep:
```bash
rg "pattern" app/         # быстрее grep, уважает .gitignore автоматически
rg -t py "pattern"        # только .py файлы
rg -l "pattern" tests/    # только имена файлов
```

## Frontend commands (from frontend/)
```bash
npm run test          # vitest run (single pass)
npm run test:watch    # vitest (interactive mode)
npm run test:coverage # vitest run --coverage
npm run lint
npm run build         # tsc -b && vite build
```

## Python conventions
- Python 3.12; ruff E,F,I; line-length=115; target-version=py312
- alembic/ already excluded in pyproject.toml — do not add again
- Code comments in Russian, use е (not ё); explain why/what, not every line
- Pydantic v2: model_validator, field_validator (not v1-style)
- SQLAlchemy 2.x async: `async with session.begin()`
- Advisory locks: `engine.execution_options(isolation_level="AUTOCOMMIT").connect()`
- Conventional commits: feat/fix/refactor/test/chore

## Do NOT
- Synchronous SQLAlchemy calls or sync DB sessions in async routes/services.
- Hardcoded secrets in code or tests. Use `.env` variables strictly (keep structure in `.env.example`).
- CommonJS in frontend (use ESM `import/export` only, no `require`).
- Bare `except:` in Python — use specific exception types only (e.g., `HTTPException`, `ValueError`).
- Pydantic v1 syntax in FastAPI schemas (use Pydantic v2 `model_config` and modern fields).

## DB & env-var map (critical)
Two Supabase instances: production (`btmiovdmasqufufyuokx`) and staging (`gpbymgvkqtiueoyborrw`).
```
DATABASE_URL (local .env)     → production Supabase  (uvicorn locally)
DATABASE_URL (e2e CI env)     → staging Supabase     (из секрета DATABASE_SUPABASE_STAGING_URL)
DATABASE_SUPABASE_STAGING_URL → staging Supabase     (e2e CI + seeder staging)
DATABASE_TEST_URL (CI/local)  → throwaway PG container — NEVER point at Supabase (tests do drop_all)
```
Примечание: GitHub Secret с именем `DATABASE_URL` удалён. `e2e.yml` задаёт переменную окружения
`DATABASE_URL` из `${{ secrets.DATABASE_SUPABASE_STAGING_URL }}`.

## Test layers & CI coverage
```
tests/unit/              no marker    → CI job 'test'    (SQLite)
tests/integration/       no marker    → CI job 'test'    (SQLite)
tests/integration/       requires_pg  → CI job 'test-pg' (PG 16 container)
tests/integration/*e2e*  E2E_BASE_URL → .github/workflows/e2e.yml (live Railway staging)
```
CI coverage: job `test` + job `test-pg` → artifacts combine → job `coverage` fail-under=75 (текущий: 79%).

**Advisory lock (ИСПРАВЛЕНО в commit 4f66ee2):** `pg_advisory_lock` вынесен в DI-фабрику
`get_advisory_lock_factory()` (`app/core/dependencies.py`). Тесты переопределяют её через
`_noop_lock` в `tests/conftest.py`. Новые тесты бизнес-логики `GET /articles/find` → маркер
`requires_pg` НЕ нужен. Только тесты конкурентной сериализации (`test_find_articles_postgres.py`)
обязаны иметь `requires_pg`.

## Migration chain note
`seeder_keywords` NOT в `Base.metadata` через тестовый import-chain (seeder_router не импортирует
SeederKeyword) → drop_all никогда не дропает её. Migration `f9a3c1e2b7d4` использует
`ALTER TABLE ... DROP COLUMN IF EXISTS` — идемпотентна на fresh DB (initial migration не создаёт
`author_keywords`/`abstract`/`fund_sponsor`, они существовали только в production из доалембиковой истории).
