---
name: backend-architecture
description: Основной архитектурный контекст бэкенда Scopus Search (FastAPI, DB, CI/CD).
---

# Scopus Search — Backend Architecture

## Project overview
REST API (FastAPI + asyncpg + SQLAlchemy 2.x async) + React 18/TypeScript SPA (Vite + shadcn/ui + Tailwind 3).
Architecture: SOLID, layered — `app/interfaces` → `app/services` → `app/infrastructure` → `app/routers`.
Backend deploys to Railway (Docker); frontend to Vercel. DB — PostgreSQL (Supabase in production).
App config: `app/config.py` (Pydantic Settings).

## Backend layers & key files
- `app/interfaces/` — ABCs: article/catalog/search_history/search_result/user repositories + search_client + `email_service.py` (IEmailService)
- `app/services/` — business logic: search, search_history, catalog, article, user
- `app/infrastructure/` — Postgres repos, scopus_client (CQL-builder), database, `redis_client.py` (Upstash REST)
- `app/routers/` — FastAPI handlers: articles, auth, users, health, seeder_router
- `app/core/` — dependencies.py (DI + advisory lock factory + `get_email_service`), security.py (JWT/hashing), refresh_token_utils.py, cookie_constants.py, password_reset_utils.py
- `app/models/` — SQLAlchemy ORM; `app/schemas/` — Pydantic v2; `app/utils/db_utils.py`
- `tests/conftest.py` — shared fixtures (SQLite in-memory); `tests/unit/` mocked; `tests/integration/` SQLite or PG

## Commands (repo root, WSL2)
`uv run ruff check app tests && uv run ruff format --check app tests && uv run mypy app`
`uv run pytest -m "not requires_pg"` (unit + SQLite integration)
`uv run pytest -m requires_pg` (PG 16; нужен DATABASE_TEST_URL)

## Python conventions
- Python 3.12; ruff E,F,I; line-length=115; target-version=py312; alembic/ excluded
- Code comments in Russian, use е (not ё); Pydantic v2 validators; SQLAlchemy 2.x async with `session.begin()`
- Advisory locks: `engine.execution_options(isolation_level="AUTOCOMMIT").connect()`
- Conventional commits: feat/fix/refactor/test/chore

## Scopus CQL notes
- Open Access фильтр: `OPENACCESS(1)`/`NOT OPENACCESS(1)` — **не** `OA(1)`.
- DOI-фильтр: `ScopusHTTPClient.search()` пропускает статьи без `prism:doi`.

## Auth & security
- AT хранится **только in-memory** (Zustand + `tokenStore.ts`) — гидрация через `POST /auth/refresh`
- RT cleanup piggyback: `cleanup_stale_tokens()` вызывается при каждой ротации
- Password reset: `POST /auth/password-reset` + `/confirm`; токены в `password_reset_tokens`.
- Email: `BrevoEmailService` (httpx). **Railway блокирует SMTP порты 587/465**.

## DB & env-var map (critical)
Two Supabase instances: production, staging. `DATABASE_URL` → production (uvicorn) / staging (e2e CI). `DATABASE_TEST_URL` → throwaway PG-контейнер (не Supabase).

## Redis (Upstash) — кэш stats
`UPSTASH_REDIS_REST_URL`/`TOKEN` — Upstash Redis REST. Cache-aside в `CatalogService.get_stats()` (TTL=60s). Ключ кэша обязательно включает `db_namespace` (sha256 от `DATABASE_URL`). Публичные `/stats/journal-impact` и `/stats/pivot` не кэшируются.

## Personal search data & GC
- `search_history` тримится до 100/юзер бесшовно внутри `SearchService.find_and_save`. `keep_since` обязателен.
- **GC статей-сирот**: `IArticleRepository.delete_orphaned()` удаляет строки, отсутствующие одновременно в `search_result_articles` И `catalog_articles`. Вызывается `/seeder/gc`.
- **Observability**: structured JSON logging (`structlog`) + `RequestIDMiddleware`.

## Test layers & CI
tests/unit/ + tests/integration/ (SQLite) → CI job 'test'
tests/integration/ requires_pg → CI job 'test-pg' (PG 16)

## Migration chain note
`seeder_keywords` NOT в `Base.metadata`. `alembic/env.py`: `include_object` хук исключает expression-индексы из autogenerate.
