# Scopus Search — Claude Code memory

## Project overview
REST API (FastAPI + asyncpg + SQLAlchemy 2.x async) + React 18/TypeScript SPA (Vite + shadcn/ui + Tailwind 3).
Architecture: SOLID, layered — `app/interfaces` → `app/services` → `app/infrastructure` → `app/routers`.
Backend deploys to Railway (Docker); frontend to Vercel. DB — PostgreSQL (Supabase in production).
App config: `app/config.py` (Pydantic Settings).

## Backend layers & key files
`app/interfaces/` — ABCs (dependency inversion): article/catalog/search_history/search_result/user repositories + search_client
`app/services/`   — business logic: search, search_history, catalog, article, user
`app/infrastructure/` — Postgres repos, scopus_client (CQL-builder), database
`app/routers/`    — FastAPI handlers: articles, auth, users, health, seeder_router
`app/core/`       — dependencies.py (DI + advisory lock factory), security.py (JWT/hashing), refresh_token_utils.py
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

## Python conventions
- Python 3.12; ruff E,F,I; line-length=115; target-version=py312; alembic/ excluded в pyproject.toml
- Code comments in Russian, use е (not ё); Pydantic v2 validators; SQLAlchemy 2.x async with `session.begin()`
- Advisory locks: `engine.execution_options(isolation_level="AUTOCOMMIT").connect()` — вынесено в DI `get_advisory_lock_factory()`
- Conventional commits: feat/fix/refactor/test/chore

## Scopus CQL notes
- Open Access фильтр: `OPENACCESS(1)` / `NOT OPENACCESS(1)` — **не** `OA(1)` (Scopus API отвергает с 400).
  Проверено прямым запросом к API 2026-06-25. Файл: `app/infrastructure/scopus_client.py`.

## Do NOT
- Sync SQLAlchemy calls in async routes. Hardcoded secrets. CommonJS in frontend.
- Bare `except:` — только конкретные типы. Pydantic v1 syntax в FastAPI схемах.

## DB & env-var map (critical)
Two Supabase instances: production (`btmiovdmasqufufyuokx`) and staging (`gpbymgvkqtiueoyborrw`).
```
DATABASE_URL (local .env)     → production Supabase  (uvicorn locally)
DATABASE_URL (e2e CI env)     → staging Supabase     (из секрета DATABASE_SUPABASE_STAGING_URL)
DATABASE_TEST_URL             → throwaway PG container — NEVER point at Supabase (tests do drop_all)
```
GitHub Secret `DATABASE_URL` удалён. `e2e.yml` задаёт `DATABASE_URL` из `${{ secrets.DATABASE_SUPABASE_STAGING_URL }}`.

## Test layers & CI
```
tests/unit/ + tests/integration/ (no marker) → CI job 'test'    (SQLite)
tests/integration/ requires_pg              → CI job 'test-pg' (PG 16)
tests/integration/*e2e*  E2E_BASE_URL       → e2e.yml          (live Railway staging)
```
CI coverage: jobs `test` + `test-pg` → combined artifacts → `coverage` fail-under=75 (текущий: 79%).
Advisory lock в DI-фабрике → новые тесты `GET /articles/find` не требуют `requires_pg`; только `test_find_articles_postgres.py` (конкурентность).

## Migration chain note
`seeder_keywords` NOT в `Base.metadata` (seeder_router не импортирует SeederKeyword) → drop_all её не трогает.
Migration `f9a3c1e2b7d4`: `ALTER TABLE ... DROP COLUMN IF EXISTS` — идемпотентна на fresh DB.
