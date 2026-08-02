# Scopus Search — Claude Code memory

## Project overview
REST API (FastAPI + asyncpg + SQLAlchemy 2.x async) + React 18/TS SPA (Vite + shadcn/ui + Tailwind 3). Layered SOLID: `app/interfaces` → `app/services` → `app/infrastructure` → `app/routers`. Backend on Railway (Docker), frontend on Vercel. DB: PostgreSQL (Supabase in prod). Config: `app/config.py` (Pydantic Settings).

## Backend layers & key files
`app/interfaces/` — ABCs: article/catalog/search_history/search_result/user repositories + search_client + `email_service.py` (IEmailService)
`app/services/`   — business logic: search, search_history, catalog, article, user
`app/infrastructure/` — Postgres repos, scopus_client (CQL builder), database, `redis_client.py` (Upstash REST)
`app/routers/`    — FastAPI handlers: articles, auth, users, health, seeder_router
`app/core/`       — dependencies.py (DI + advisory lock factory + `get_email_service`), security.py (JWT/hashing), refresh_token_utils.py, cookie_constants.py, password_reset_utils.py, sentry_config.py (`configure_sentry()`)
`app/models/`     — SQLAlchemy ORM; `app/schemas/` — Pydantic v2; `app/utils/db_utils.py`
`tests/conftest.py` — shared fixtures (SQLite in-memory); `tests/unit/` mocked; `tests/integration/` SQLite or PG
`frontend/`       — React SPA; see frontend/CLAUDE.md

## Commands (repo root, WSL2)
```bash
uv run ruff check app tests && uv run ruff format --check app tests && uv run mypy app
uv run pytest -m "not requires_pg"   # unit + SQLite integration (CI job 'test')
uv run pytest -m requires_pg         # PG 16; needs DATABASE_TEST_URL (throwaway, NOT Supabase)
rg "pattern" app/                    # ripgrep, not grep; -t py for .py; -l for filenames
```
Frontend: `cd frontend && npm run test / lint / build`

## MCP servers (Claude Code, user-scope, `claude mcp list`)
Base: `github`, `supabase`, `railway`, `claude.ai Vercel`, `sequential-thinking`, `memory`. Added 2026-07-02: `context7` (dependency docs), `chrome-devtools` (drive/debug Chrome for frontend QA; `--browserUrl` attaches to an already-open window), `upstash` (direct Upstash Redis management, needs an account-level key).

## Permissions allowlist (`.claude/settings.json`, added 2026-07-02)
Project-scope (not the personal `.claude/settings.local.json`). Read-only allowlist: `uv run ruff check *`, `uv run ruff format --check *`, `uv run mypy *`, `uv run pytest -m "not requires_pg"`, `cd frontend && npm run test/lint/build`. `rg`/`git status` already in base auto-allow; `pytest -m requires_pg` intentionally excluded — runs `drop_all` on the PG container, not read-only.

## Python conventions
- Python 3.12; ruff E,F,I; line-length=115; target-version=py312; `alembic/` excluded in pyproject.toml
- Code comments in Russian, е not ё; Pydantic v2 validators; SQLAlchemy 2.x async via `session.begin()`
- Advisory locks: `engine.execution_options(isolation_level="AUTOCOMMIT").connect()` — factored into DI `get_advisory_lock_factory()`
- Conventional commits: feat/fix/refactor/test/chore

## Scopus CQL notes
- Open Access filter: `OPENACCESS(1)`/`NOT OPENACCESS(1)` — **not** `OA(1)` (Scopus API rejects with 400, verified 2026-06-25). File: `app/infrastructure/scopus_client.py`.
- DOI filter: `ScopusHTTPClient.search()` skips articles without `prism:doi` at parse time (commit `62d1d13`). Collection holds **DOI-indexed articles only**.

## Auth & security (auth-refactoring, merged 2026-06-26)
- AT stored **in-memory only** (Zustand + `tokenStore.ts`), not localStorage; hydration only via `POST /auth/refresh`
- Cookie constants: `app/core/cookie_constants.py` (RT_COOKIE_NAME, RT_COOKIE_MAX_AGE, AT_HANDSHAKE_COOKIE_NAME)
- RT cleanup piggyback: `cleanup_stale_tokens()` runs on every rotation in `/auth/refresh`
- Password reset: `POST /auth/password-reset` + `POST /auth/password-reset/confirm`; tokens in `password_reset_tokens` (migration 0011); confirm triggers `revoke_all_user_tokens()`
- Email: `IEmailService` ABC → `BrevoEmailService` (httpx, `api.brevo.com/v3/smtp/email`). **Railway blocks SMTP ports 587/465 — never use aiosmtplib/SMTP on Railway.** Env vars: `BREVO_API_KEY` + `FROM_EMAIL`.

## Do NOT
- Sync SQLAlchemy calls in async routes. Hardcoded secrets. CommonJS in frontend. Bare `except:` — specific types only. Pydantic v1 syntax in FastAPI schemas.
- SMTP/aiosmtplib on Railway (port 587 blocked). Use the Brevo REST API (httpx).
- Rely on Railway's outbound IP being static for provider-side IP-allowlist integrations (Brevo etc.) — egress floats, caused a silent 401 for 3 weeks (health-check alerting, PR #77, 2026-08-01). Fix is provider-side — disable IP restriction on API keys, not key rotation.

## DB & env-var map (critical)
2 Supabase instances: production (`btmiovdmasqufufyuokx`), staging (`gpbymgvkqtiueoyborrw`). `DATABASE_URL` → production Supabase locally (uvicorn) / staging Supabase in e2e CI (from secret `DATABASE_SUPABASE_STAGING_URL`). `DATABASE_TEST_URL` → throwaway PG container, NEVER Supabase (tests run `drop_all`). GitHub Secret `DATABASE_URL` removed (used to point at staging, conflicted with local `.env`).

## Redis (Upstash) — stats cache (PR #32, merged 2026-06-27)
`UPSTASH_REDIS_REST_URL`/`TOKEN` — Upstash Redis REST (HTTPS 443); in `.env`, Railway (prod+staging — **1 physical instance**, unlike separate Supabase DBs), GitHub Secrets.
Cache-aside in `CatalogService.get_stats()` (TTL=60s, `redis_client.py` singleton); graceful degradation → `redis_client=None` → direct DB query.
Cache key must include `db_namespace` (sha256 of `DATABASE_URL`, injected via DI in `get_catalog_service()`) — else prod/staging share 1 Redis key (bug 2026-07-02: `e2e.yml` refreshed the shared key with staging data on every push, prod served staging stats for 60s each time).
`SET LOCAL work_mem='32MB'` in `postgres_catalog_repo.get_stats()` — `dialect=="postgresql"` only. Tests: `FakeRedis` in-memory double, real Upstash unused in CI.
Public `/stats/journal-impact` and `/stats/pivot` (Table Builder/Journal Landscape, PR #44, merged 2026-07-03) were initially designed **uncacheable** (runtime-parameterized, unlike `/stats`); `ALLOWED_PIVOT_PAIRS` whitelist in `app/schemas/article_schemas.py` — defense-in-depth against SQL injection on top of `PivotDimension`'s Literal typing. Revised 2026-07-10: `/stats/journal-impact` now cached (TTL=60s, `make_journal_impact_cache_key`) — `max_year` slider has only 3 values (2022–2024), unlike `/stats/pivot`'s combinatorial space (stays uncacheable). Median in `get_journal_impact` now via Postgres `percentile_cont` (SQLite tests keep the Python fallback). Third cacheable target added 2026-08-02 (PR #81): `CatalogService._get_total_count` (`GET /articles/`'s pagination count) via `make_catalog_count_cache_key` — same TTL/db_namespace pattern, see "Catalog search latency" below.

## Personal search data (PR #45, merged 2026-07-04; extended PR #46, merged 2026-07-05)
`search_history` trims to `SearchHistoryService.HISTORY_DEPTH_LIMIT=100`/user seamlessly inside `SearchService.find_and_save` (`ISearchHistoryRepository.trim_to_last_n(user_id, n, keep_since)`, between `insert_row` and `save_results`). `keep_since` is required: `HISTORY_DEPTH_LIMIT(100) < QUOTA_LIMIT(200)` over the same 7-day window — without it, retention undercounts `count_in_window()` and the weekly Scopus quota becomes unreachable. `find_and_save` writes `search_history` (`result_count=0`) even on 0 articles from Scopus — an early `return []` before `insert_row` used to drop 0-result searches from history/quota (bug since commit 1, fixed 2026-07-06). `GET /articles/stats/personal` and `GET /articles/stats/personal/activity` (both JWT, uncached) feed `/explore?mode=personal` (KPI/Drawer + `PersonalActivityChart`/`FilterFingerprintStrip`, auto week/month granularity above a 70-day threshold). `/profile` — view past-search articles via `GET /articles/history/{id}/results`.

**Orphan article GC** (issue #47, shipped 2026-07-06, direct commit to main): CASCADE-deleting `search_result_articles` on retention-trim can leave an `articles` row with 0 references. `IArticleRepository.delete_orphaned()` (`postgres_article_repo.py`) deletes only rows absent from BOTH `search_result_articles` AND `catalog_articles` (correlated `NOT EXISTS` ×2 — both checks required: `catalog_articles.article_id` has `ondelete=CASCADE`, a false delete would wipe real catalog data). `POST /seeder/gc` (same `X-Seeder-Secret` as `/seeder/seed`) is called by the seeder (`seed_db.py`) once per run's end — piggyback on the existing 2h cron, no separate job.

**Observability without external services** (issue #48, merged 2026-07-06, branch `feat/observability`, no PR): structured JSON logging (`structlog`, `app/core/logging_config.py`) + `RequestIDMiddleware` — `request_id` via contextvars, same id in the `X-Request-ID` header and every request log line. Global exception handler (`app/main.py`) logs unhandled exceptions as ERROR with traceback, client gets a generic 500 (`request_id` here comes straight from `structlog.contextvars` — `ServerErrorMiddleware` sits above `RequestIDMiddleware` in the stack). `GET /health/redis` (alongside `/health`, `/health/db`) + `POST /seeder/health-check` — piggyback on the seeder cron: sends an alert email via `BrevoEmailService.send_alert_email()` (new `IEmailService` method) on DB/Redis degradation. Deliberately no Sentry/OTel at the time — revisited in PR #63 (below). Known gap: `X-Request-ID` isn't surfaced to the frontend user — candidate for a future ticket.

## Test layers & CI
```
tests/unit/ + tests/integration/ (no marker) → CI job 'test'    (SQLite)
tests/integration/ requires_pg              → CI job 'test-pg' (PG 16)
tests/integration/*e2e*  E2E_BASE_URL       → e2e.yml          (live Railway staging)
```
CI coverage: jobs `test` + `test-pg` → combined artifacts → `coverage` fail-under=80 (currently 81%, PR #45).
Advisory lock in the DI factory → new `GET /articles/find` tests don't need `requires_pg`; only `test_find_articles_postgres.py` (concurrency) does.

### Full CI job matrix (2026-06-26)
| Workflow | Jobs | Trigger |
|---|---|---|
| `tests.yml` | `test` (SQLite), `test-pg` (PG16 + alembic check), `quality` (ruff/mypy/pip-audit), `coverage` (80%, after test+test-pg) | push+PR → main |
| `frontend-tests.yml` | `typecheck`, `lint` (ESLint + npm audit), `unit`, `integration` (70% threshold), `build` | push main (paths: frontend/**) |
| `e2e.yml` | `e2e` — smoke tests against Railway staging | push main |
| `keep_alive.yml` / `keep_alive_staging.yml` | ping `/health/db`+`/health` — keeps Railway awake / Supabase unpaused | cron: prod 1×/14min, staging 1×/day |

**Branch protection (main):** force-push and deletion blocked; required PR checks: `test`, `test-pg`, `Code quality` (strict). `enforce_admins=false` — owner can push directly.
**Dependabot:** `.github/dependabot.yml` — pip + npm + github-actions, weekly, limit 3 PRs/ecosystem.

## Migration chain note
`seeder_keywords` NOT in `Base.metadata` at runtime → `drop_all` skips it; `alembic/env.py` imports `SeederKeyword` explicitly for autogenerate.
Chain: `f9a3c1e2b7d4` → `0010` → `0011` → `0012` → `0013_fix_schema_drift` → `0014_functional_indices_lower` → `0015_trim_search_history_over_limit` → `0016_trgm_gist_search_indices` → `0017_publication_date_index` → `0018_trgm_gin_indices` (head, PR #81; `CREATE/DROP INDEX CONCURRENTLY` + `ALTER INDEX ... RENAME`, applied on staging Supabase, prod gets it on next deploy via `entrypoint.sh` — same pattern as 0016/0017).
`alembic/env.py`: `_MIGRATION_ONLY_INDICES` (renamed from `_FUNCTIONAL_INDICES`, PR #58) excludes indices autogenerate can't reproduce via structural ORM comparison — expression indices (`lower(...)`) and GiST/operator-class (`gist_trgm_ops`); without it `alembic check` flags them as extraneous.

## Catalog search performance (feedback pts 4-5, PR #58, merged 2026-07-09)
`GET /articles/` pagination: exact `COUNT(*)` capped at `CatalogService.TOTAL_COUNT_CAP=2000` (subquery `LIMIT cap+1` — full scan on broad ILIKE filters otherwise dominates query cost); `PaginatedArticleResponse.total_is_capped` — contract doesn't silently misstate the number, frontend shows "2000+". `pg_trgm` on `articles.title`/`author` for ILIKE (GiST originally, switched to GIN in PR #81 — see below); sargable predicate instead of `extract(year FROM publication_date)` in `get_journal_impact` + btree on `publication_date`. `DB_ECHO`/`DB_POOL_SIZE`/`DB_MAX_OVERFLOW` configurable via `.env` (`app/config.py`), defaults preserve prior behavior. Honest k6 run on a prod-scale (142k articles) copy — `tests/load/baseline.js`; full methodology and P95/P99 progression by step (11.89s → 632ms) in `docs/project-meta/project_context/scopus-search-feedback-2026-07-03.md`.

## Catalog search latency — GiST→GIN + count cache (PR #81, merged 2026-08-02)
Root cause of `GET /articles/?search=` taking 0.5–9.8s: `get_total_count()`'s `BitmapOr` scan over `pg_trgm` GiST indices was CPU-bound (~4.9s, 100% buffer cache hits — confirmed `VACUUM ANALYZE` alone doesn't help, it's not a cache-miss/stale-stats problem). Fix: (1) Redis cache-aside on `get_total_count` (TTL=60s, `make_catalog_count_cache_key`, same pattern as `get_stats`) — `get_all()` stays uncached/live; (2) `ix_articles_title_trgm`/`ix_articles_author_trgm` switched **GiST → GIN** (migration `0018_trgm_gin_indices`) — reverses the PR #58 GiST choice, valid only while the seeder is frozen (GIN's write cost was that decision's original reason; re-check before ever unfreezing it). Measured on prod after deploy, warm: `get_total_count()` 4.9s → 164ms (~30x); `get_all()` (untouched by this PR) also dropped 520ms → 75ms as an unplanned side effect of freed `shared_buffers` room — combined ~240ms vs the original 5.4-10.7s. Storage: `articles`+`catalog_articles` 281MB → 189.5MB (-32.6%), ~99% of the saving from the two trgm indices alone (129→46.7MB, 16→7.14MB). `ix_articles_author_trgm` investigated for removal (looked low-value on one test term) — kept: a 20-term sample showed massive author-only recall on common surnames (e.g. "wang" — 8353 matches only via author, none via title). Full root-cause diagnosis, Neon-alternative evaluation, and storage/growth projections in `docs/backend-performance/catalog-search-latency/spec.md` (local only, not in git).

## Impact Analytics (PR #62, merged 2026-07-11)
`GET /stats/pivot` — new query param `metric` (`count`|`avg_citations`, default `count`); `PivotResponse.matrix` now `float` (JSON/JS doesn't distinguish 42 from 42.0), `cell_counts` — new field, ALWAYS article count regardless of `metric` (source of truth for sparse detection and "no articles" vs "avg=0"). Table Builder's top-N row/col selection stays by `count` regardless of metric. `StatsResponse.country_impact` — top 20 countries × `avg(cited_by_count)`, folded into the already-cached `get_stats()` (not a separate endpoint, unlike `journal-impact` — no runtime param/slider here); no median, no PG/SQLite branching — top-N by volume removes the "N=1 outlier on top" risk.

## Observability: Sentry (PR #63, merged 2026-07-11)
Backend (`sentry-sdk`, `app/core/sentry_config.py:configure_sentry()`) + frontend (`@sentry/react`, `frontend/src/sentry.ts:initSentry()`) — errors + performance tracing (`traces_sample_rate=1.0`, Developer plan gives 5M spans/month). 1 Sentry project for backend+frontend (not per environment) — prod/staging distinguished by the `environment` tag (backend: `RAILWAY_ENVIRONMENT_NAME`, auto from Railway; frontend: `import.meta.env.MODE`). `send_default_pii=False` on both SDKs **doesn't protect `url.full`** (verified against SDK source) — explicit `before_send`/`beforeSendTransaction`/`beforeBreadcrumb` scrub the query string (real secrets show up in URLs: `/reset-password?token=...`, `GET /auth/google/callback?code=...`). Explicit `capture_exception()`/`captureException()` at every catch point (backend global handler; frontend — 3 error boundaries + API interceptor) — don't rely on SDK auto-instrumentation over the custom `exception_handler(Exception)`. `request_id` — a Sentry tag on both ends, correlates with structured logs (issue #48). Frontend source maps — `@sentry/vite-plugin`, gated on `SENTRY_AUTH_TOKEN` (Vercel Production only): `sourcemap:'hidden'` + `filesToDeleteAfterUpload`, sources never published in `dist/`. `tests/conftest.py` forces `SENTRY_DSN=""` before importing `app.main` — else test runs send events to prod Sentry (found empirically; every SDK reads `.env` directly via `pydantic-settings`, `os.environ.pop` doesn't mask a value the file sets). CSP `connect-src` (`frontend/vercel.json`) must explicitly include the Sentry ingest domain (`https://<org-id>.ingest.<region>.sentry.io`) — else the browser blocks outgoing events even with a fully correct SDK setup (found post-merge via live browser check, direct commit to `main`).

## AI NL→pivot — removed (added PR #64/65/66 2026-07-12, removed PR #78 2026-08-01)
Text → LLM → Table Builder pivot params. Model/rate-limit calibration, explicitly deferred to "the first week of live traffic," never happened in 3 weeks — removed via a clean commit (not a revert); history and rationale in memory `project-ai-nl-pivot`. General lesson still applies to any future feature calling OpenRouter from the backend: the seeder's `OPENROUTER_API_KEY` lives only as a GitHub Actions secret — the Railway service needs its own env var of the same name (prod incident 2026-07-11/12, 100% failure rate until fixed manually).

## Seeder reliability (PR #77, merged 2026-08-01)
3 production defects from a week-long audit (13/61 runs failing) closed in 1 PR: `generate_keywords()` (`db_seeder/seeder__scripts/keyword_generator.py`) strips markdown code fences before `json.loads` and filters candidates >100 chars (mirrors `catalog_articles.keyword: VARCHAR(100)`; the LLM occasionally hits a repetition loop at temperature=0.8); `seed_db.py` no longer aborts the whole 2h cycle on a generation failure — Block B/GC/health-check still run even if Block A is skipped; `/seeder/health-check` survives an email-alert send failure (`httpx.HTTPError` → `logger.error`, honest `{"status": "degraded"}` instead of a 500). Also uncovered the Railway-IP incident — see Do NOT.
