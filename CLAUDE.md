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
`tests/conftest.py`          — shared fixtures for all tests
`tests/unit/`                — unit tests (mocked, no DB)
`tests/integration/`         — integration tests (real DB)
`tests/requirements-test.txt` — test dependencies

`frontend/`    — React 18/TypeScript SPA; see frontend/CLAUDE.md for details

## Backend commands (repo root, WSL2 bash)
```bash
ruff check app tests
mypy app
pytest -m "not integration and not manual"
pytest -m integration                      # requires DATABASE_TEST_URL
pytest tests/unit/test_X.py -v             # single file — preferred when using CLI
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
- Advisory locks: separate `engine.connect()` with `execution_options(isolation_level="AUTOCOMMIT")`
- Conventional commits: feat/fix/refactor/test/chore

## Do NOT
- Synchronous SQLAlchemy calls or sync DB sessions in async routes/services.
- Hardcoded secrets in code or tests. Use `.env` variables strictly (keep structure in `.env.example`).
- CommonJS in frontend (use ESM `import/export` only, no `require`).
- Bare `except:` in Python — use specific exception types only (e.g., `HTTPException`, `ValueError`).
- Pydantic v1 syntax in FastAPI schemas (use Pydantic v2 `model_config` and modern fields).