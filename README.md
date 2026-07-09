# Scopus Search API

[![Backend Tests](https://github.com/HelgDemidov/scopus_search_code/actions/workflows/tests.yml/badge.svg)](https://github.com/HelgDemidov/scopus_search_code/actions/workflows/tests.yml)
[![Frontend Tests](https://github.com/HelgDemidov/scopus_search_code/actions/workflows/frontend-tests.yml/badge.svg)](https://github.com/HelgDemidov/scopus_search_code/actions/workflows/frontend-tests.yml)

Russian version: [README.ru.md](README.ru.md)

**Scopus Search API** is a production fullstack service for searching, accumulating, and visualizing academic publications. It is built around integration with the global [Elsevier Scopus](https://www.scopus.com/) database. The service operates in two modes: **public search** over the thematic collection "AI & Neural Network Technologies" (no registration required) and **live search** across the full Scopus database (requires authentication).

---

## Features

| Mode | Functionality |
|---|---|
| **Without authentication** | Browse and search the "AI & Neural Network Technologies" thematic collection (~95,900 publications); multi-criteria filtering by year, country, document type, and open-access status; article detail pages; interactive analytics dashboard (/explore) with cross-filter charts, Chart Builder, and statistics on publication trends, geography, document types, top journals, authors, and keywords |
| **With authentication** | All unauthenticated features, plus: live search across the full Scopus database (up to 25 results per query); personal search history with filtering; weekly API quota counter; account management (email/password · Google OAuth · password reset via email) |

---

## Infrastructure and Stack

```
GitHub ──► Vercel (Frontend SPA)
               │
               ▼ REST API (HTTPS)
          Railway (Backend FastAPI)
               │
               ▼ asyncpg / SQLAlchemy
          Supabase (PostgreSQL 17)

GitHub Actions ──► db_seeder (cron, every 2 h)
                       │
                       ▼ POST /seeder/seed
                  Railway (Backend)
```

| Layer | Technology | Hosting |
|---|---|---|
| **Frontend** | React 18, TypeScript, Vite, Zustand, Axios, Recharts, shadcn/ui, Tailwind CSS | Vercel |
| **Backend** | Python 3.12, FastAPI, SQLAlchemy 2.0 async, Alembic, Pydantic v2, httpx, Authlib | Railway |
| **Database** | PostgreSQL 17 (Supabase), Session Pooler | Supabase (eu-west-1) |
| **Cache** | Upstash Redis (HTTPS REST, TTL 60 s) — `GET /articles/stats` response cache | Upstash |
| **CI/CD** | GitHub Actions — backend (`tests.yml`: pytest · ruff · mypy · alembic check · 80% coverage), frontend (`frontend-tests.yml`: Vitest · ESLint · tsc · 70% coverage · build), staging E2E (`e2e.yml`) | GitHub |
| **Seeder** | Python + httpx + asyncpg + OpenRouter LLM | GitHub Actions (cron, every 2 h) |

---

## Architecture

### Backend

Multi-layer Clean Architecture with a clear separation of responsibilities:

```
app/
├── routers/          # HTTP endpoints: articles, auth, users, health, seeder
├── services/         # Business logic: SearchService, CatalogService,
│                     #   ArticleService, SearchHistoryService, UserService
├── infrastructure/   # PostgreSQL repositories + ScopusHTTPClient + UpstashRedisClient
├── interfaces/       # ABC interfaces for repositories, clients, IEmailService
├── models/           # SQLAlchemy ORM models (5 tables)
├── schemas/          # Pydantic v2 request/response schemas
├── core/             # DI, JWT, refresh-token utilities, dependencies
├── config.py         # Pydantic Settings — single source of configuration
└── main.py           # FastAPI app: middleware, routers, lifespan
```

### Frontend

React SPA with routing via React Router and global state via Zustand:

```
frontend/src/
├── api/              # Axios client (client.ts) + articles, auth, stats, users modules
├── stores/           # articleStore, authStore, historyStore, quotaStore,
│                     #   statsStore, dashboardStore, tokenStore (AT in-memory, no localStorage)
├── pages/            # HomePage, ExplorePage, ProfilePage, AuthPage, ArticlePage,
│                     #   OAuthCallback, ForgotPasswordPage, ResetPasswordPage
├── components/       # articles/, charts/, layout/, profile/, search/, ui/
├── hooks/            # usePagination
└── types/            # TypeScript types and API interfaces
```

---

## API Endpoints

### Public

| Method | Path | Description |
|---|---|---|
| `GET` | `/articles/` | Paginated catalog list; keyword/full-text search + multi-criteria filtering (year range, country, document type, open-access status) |
| `GET` | `/articles/stats` | Aggregated collection statistics (by year, journal, country, type) |
| `GET` | `/articles/{id}` | Article detail page |
| `GET` | `/health` | Health check |

### Authentication

| Method | Path | Description |
|---|---|---|
| `POST` | `/users/register` | Register by email/password |
| `POST` | `/users/login` | Log in; returns AT, sets RT cookie |
| `GET` | `/users/me` | Current user profile |
| `GET` | `/auth/google/login` | Initiate Google OAuth flow |
| `GET` | `/auth/google/callback` | OAuth callback; redirects to frontend with token |
| `POST` | `/auth/refresh` | Exchange RT cookie for new AT + RT rotation |
| `POST` | `/auth/logout` | Revoke RT, clear cookie |
| `POST` | `/auth/password-reset` | Initiate password reset; sends one-time link via Brevo |
| `POST` | `/auth/password-reset/confirm` | Confirm reset with token; sets new password, revokes all RTs |

### Private (require JWT)

| Method | Path | Description |
|---|---|---|
| `GET` | `/articles/find` | Live Scopus search (up to 25 results); accepts same filters as `GET /articles/`; checks quota; saves result and history |
| `GET` | `/articles/find/quota` | Weekly quota status: `limit`, `used`, `remaining`, `reset_at` |
| `GET` | `/articles/history` | User search history (up to 100 records) |
| `GET` | `/articles/search/stats` | Aggregates over personal search articles |

<details>
<summary>Quota and concurrent access</summary>

The limit is **200 live searches / 7 days** (sliding window) per user. When exceeded — HTTP 429, Scopus is not called, no history record is created.

To prevent race conditions on concurrent requests from the same user, `pg_advisory_xact_lock(user_id)` is acquired before the quota check and released with the transaction. This guarantees correct handling even under simultaneous requests.

Scopus rate limit headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`) are proxied in the response to the frontend.

</details>

---

## Database

Current migration version: `0014_functional_indices_lower`.

| Table | Purpose | Records (prod) |
|---|---|---|
| `articles` | Normalized Scopus publication registry | ~96,700 |
| `catalog_articles` | Thematic collection membership (seeder keyword) | ~95,900 |
| `search_history` | User live-search history (JSONB `filters`) | ~100 |
| `search_result_articles` | Junction table: search → articles with `rank` | ~2,300 |
| `seeder_keywords` | Used seeder phrases with clusters and timestamps | ~19,100 |
| `users` | Service users | ~9 |
| `refresh_tokens` | Active refresh tokens with rotation support | ~77 |
| `password_reset_tokens` | One-time password reset tokens (short-lived) | — |

---

## Authentication and Security

- **Access Token** — Bearer JWT, lives 30 minutes, stored **in-memory** (Zustand `tokenStore`) — never persisted to `localStorage`; hydrated on page load via `POST /auth/refresh`.
- **Refresh Token** — `httpOnly; Secure; SameSite=None` cookie (30 days); rotated on every `/auth/refresh` call; stale and revoked tokens pruned automatically. Revocation via `/auth/logout`.
- **Silent refresh** — Axios interceptor catches 401, calls `POST /auth/refresh` exactly once (Promise singleton prevents race conditions), then retries the original request.
- **Google OAuth** — Authlib + Starlette SessionMiddleware; state stored in a signed cookie (CSRF protection).
- **Password reset** — one-time token delivered via Brevo REST API (email); confirm endpoint sets new password and revokes all active refresh tokens.
- **CSRF guard** on `/auth/refresh` — `X-Requested-With: XMLHttpRequest` header required.
- **CORS** — strict origin allowlist from `ALLOWED_ORIGINS`; wildcard `*` with `credentials: true` is never used.
- **Seeder** — authenticated via static `X-Seeder-Secret` header (not a user JWT).
- Sensitive fields (`input`) are stripped from Pydantic 422 responses via a custom exception handler.

---

## Automated Seeder

A GitHub Actions workflow (runs every 2 hours) populates the thematic collection without consuming user quota.

**Algorithm:**
1. Determine the thematic cluster for the run (rotating schedule).
2. Read used phrases from `seeder_keywords`; fetch re-pagination candidates (keywords with a saved offset).
3. **Block A — new keywords (up to 50):** generate phrase candidates via OpenRouter LLM, deduplicate against used phrases, call `POST /seeder/seed` for each, record result in `seeder_keywords`.
4. **Block B — re-pagination (up to 188):** for each candidate with a saved offset, call `POST /seeder/seed` at the next page to retrieve additional Scopus results for already-indexed keywords.
5. The backend queries Scopus, atomically upserts into `articles` + `catalog_articles`, returns `rate_remaining`.
6. Stop either block when `rate_remaining < 500`.

<details>
<summary>Seeder configuration</summary>

Environment variables: `DATABASE_URL`, `SEEDER_SECRET`, `OPENROUTER_API_KEY`, `SEEDER_BASE_URL`.

Parameters in `seed_db.py`: `ARTICLES_PER_QUERY = 25`, `DELAY_BETWEEN_REQUESTS = 2.0` sec, `KEYWORDS_TO_USE = 120` (LLM candidates per run), `NEW_KW_BUDGET = 50` (Block A cap), `REPAG_BUDGET = 188` (Block B cap), `RATE_LIMIT_STOP_THRESHOLD = 500`.

Supabase connection via `asyncpg` with `statement_cache_size=0` (required for PgBouncer transaction mode).

</details>

---

## Testing

**Backend:** 172 tests (`pytest` + `pytest-asyncio`), all green, across three layers:

| Layer | Tests | What it covers |
|---|---|---|
| Unit (SQLite, mocked) | ~54 | Services (article, catalog, search, user), Scopus client, interface contracts, seeder router, Redis cache |
| Integration (SQLite) | ~97 | Full HTTP stack: auth, articles, search history, password reset, RT lifecycle, seeder endpoint |
| Integration (PG) | 21 | `pg_advisory_xact_lock` concurrency; requires `DATABASE_TEST_URL` (throwaway PG, never Supabase) |
| E2E (Staging) | — | Real Railway + Supabase staging; auto-skipped without `E2E_BASE_URL` |

**Frontend:** 298 tests (`Vitest` + Testing Library), all green; statements coverage 76.5% (threshold: 70%).

<details>
<summary>Running the tests</summary>

```bash
# Backend — SQLite only (fast, no PostgreSQL required)
uv run pytest tests/ -m "not requires_pg"

# Backend — all tests (requires DATABASE_TEST_URL → throwaway PG instance)
uv run pytest tests/

# Frontend
cd frontend && npm run test
```

</details>

---

## Performance

We use [k6](https://k6.io/) for load testing critical read-only endpoints (full-text search, journal-impact stats).

**Methodology.** Run against an isolated, disposable Postgres — never the shared Supabase instance
(a load test has no business generating synthetic traffic there). Seeded at production scale via a
one-time read-only copy of `articles` + `catalog_articles` from production (no user/auth tables —
those carry real PII and were never touched). `DB_ECHO=false` and `DB_POOL_SIZE`/`DB_MAX_OVERFLOW`
sized for the target concurrency (both configurable via `.env`, see `.env.example`) — otherwise the
measurement drowns in its own SQL-echo logging and connection-pool queueing instead of reflecting
the app.

**Baseline (142,658 articles, 20 VUs, isolated Postgres, 2026-07-09):**
*   **Target:** `P(95) < 500ms`, `P(99) < 1000ms`, `rate(errors) < 1%`.
*   **First honest measurement:** thresholds failed — `P(95) = 11.89s`, `P(99) = 13.39s`, but
    **0% errors** (no timeouts, no failed requests — pure queueing, not the connection-pool/network
    artifacts of an earlier, buggy attempt). Root-caused via `EXPLAIN ANALYZE`: both endpoints fell
    back to a full parallel sequential scan because no index matched their actual query shape —
    `title ILIKE '%term%' OR author ILIKE '%term%'` (leading wildcard defeats every btree, including
    the existing `ix_articles_lower_*`) and `EXTRACT(year FROM publication_date) <= max_year`
    (a function over the column also defeats indexing). Individually both were sub-300ms and
    invisible in the browser; at 20 concurrent VUs, every request's own parallel workers competed
    for the container's CPU cores — that queueing, not per-query cost, produced the multi-second
    tail latency.
*   **Fixed in 3 measured steps, cheapest first** (see `docs/project_context` for the full trade-off
    discussion — GiST over GIN, sargable predicates over functional indexes):
    1. Cap the pagination `COUNT(*)` at 2000 (`SELECT count(*) FROM (... LIMIT 2001) t` — the planner
       stops scanning once it finds the cap, regardless of a term's real selectivity) and show an
       honest "2000+" instead of a false-precision exact number. → `P(95) = 10.03s`, `P(99) = 12.36s`
       — real but modest; the search scan itself was still the bottleneck, capping only removed the
       uncapped-`COUNT`'s own extra cost.
    2. `pg_trgm` **GiST** index on `title`/`author` (not GIN — cheaper to write given the seeder's
       bulk-update pattern, no pending-buffer/autovacuum overhead to manage; costs a bit more on read
       and needs an index recheck). → `P(95) = 1.74s`, `P(99) = 2.37s`.
    3. Sargable rewrite of the year filter (`publication_date < make_date(max_year+1,1,1)` instead of
       `EXTRACT(year FROM ...)`) + a plain btree index on `publication_date`. → **`P(95) = 632ms`,
       `P(99) = 1.06s`.**
*   **Net result:** ~19x on P95, ~13x on P99 versus the first honest measurement. Thresholds are not
    fully met yet — P99 misses by 60ms — but the app now visibly scales, and every step's cost/benefit
    is measured and documented, not assumed.
*   **Command to run baseline:**
    ```bash
    docker run --rm --network host -i grafana/k6 run - < tests/load/baseline.js
    ```
    *(Requires the backend running on `http://localhost:8000` against an isolated, production-scale-seeded database)*

---

## Local Launch

<details>
<summary>Backend via Docker Compose</summary>

```bash
docker compose up --build
```

API: `http://localhost:8000` · Swagger: `http://localhost:8000/docs`

</details>

<details>
<summary>Backend without Docker</summary>

```bash
# Requires uv (https://docs.astral.sh/uv/)
uv sync
# Configure .env based on .env.example
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

Frontend environment variables go in `frontend/.env.local`:
```
VITE_API_BASE_URL=http://localhost:8000
```

</details>

<details>
<summary>Environment variables (.env.example)</summary>

| Variable | Description |
|---|---|
| `SCOPUS_API_KEY` | Elsevier API key (dev.elsevier.com) |
| `DATABASE_URL` | Supabase Session Pooler connection string (asyncpg) |
| `SECRET_KEY` | JWT signing secret |
| `ALGORITHM` | JWT algorithm (HS256) |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Access token TTL (30) |
| `SESSION_SECRET_KEY` | Starlette SessionMiddleware secret (OAuth state) |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `OAUTH_REDIRECT_URI` | Callback URI for Google OAuth |
| `FRONTEND_URL` | Frontend URL (CORS + OAuth redirect) |
| `ALLOWED_ORIGINS` | Comma-separated list of allowed CORS origins |
| `SEEDER_SECRET` | Static secret for `X-Seeder-Secret` header |
| `OPENROUTER_API_KEY` | OpenRouter API key (seeder phrase generation) |
| `BREVO_API_KEY` | Brevo API key for transactional email (password reset) |
| `FROM_EMAIL` | Sender address used by Brevo |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis HTTPS endpoint (stats response cache; optional) |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis REST API token (optional) |

> **Before publishing:** scan the README and `.env.example` for real domains, email addresses, tokens, and any secret-like strings — replace all such values with neutral placeholders.

</details>
