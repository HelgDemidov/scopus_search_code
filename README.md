# Scopus Search API

[![Backend Tests](https://github.com/HelgDemidov/scopus_search_code/actions/workflows/tests.yml/badge.svg)](https://github.com/HelgDemidov/scopus_search_code/actions/workflows/tests.yml)
[![Frontend Tests](https://github.com/HelgDemidov/scopus_search_code/actions/workflows/frontend-tests.yml/badge.svg)](https://github.com/HelgDemidov/scopus_search_code/actions/workflows/frontend-tests.yml)

Russian version: [README.ru.md](README.ru.md)

**Scopus Search API** is a production fullstack service for searching, accumulating, and visualizing academic publications. It is built around integration with the global [Elsevier Scopus](https://www.scopus.com/) database. The service operates in two modes: **public search** over the thematic collection "AI & Neural Network Technologies" (no registration required) and **live search** across the full Scopus database (requires authentication).

---

## Features

| Mode | Functionality |
|---|---|
| **Without authentication** | Search and browse articles from the thematic collection (~39,500 publications); article detail cards; collection analytics |
| **With authentication** | Live search in Scopus (up to 25 articles per request); search history with filtering; weekly quota counter; personal search analytics |

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

GitHub Actions ──► db_seeder (daily cron)
                       │
                       ▼ POST /seeder/seed
                  Railway (Backend)
```

| Layer | Technology | Hosting |
|---|---|---|
| **Frontend** | React 19, TypeScript, Vite, Zustand, Axios, Recharts, shadcn/ui, Tailwind CSS | Vercel |
| **Backend** | Python 3.12, FastAPI, SQLAlchemy 2.0 async, Alembic, Pydantic v2, httpx, Authlib | Railway |
| **Database** | PostgreSQL 17 (Supabase), Session Pooler | Supabase (eu-west-1) |
| **CI/CD** | GitHub Actions (backend pytest + frontend Vitest) | GitHub |
| **Seeder** | Python + httpx + asyncpg + OpenRouter LLM | GitHub Actions (cron) |

---

## Architecture

### Backend

Multi-layer Clean Architecture with a clear separation of responsibilities:

```
app/
├── routers/          # HTTP endpoints: articles, auth, users, health, seeder
├── services/         # Business logic: SearchService, CatalogService,
│                     #   SearchHistoryService, UserService
├── infrastructure/   # PostgreSQL repositories + ScopusHTTPClient
├── interfaces/       # ABC interfaces for repositories and clients
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
├── stores/           # articleStore, authStore, historyStore, quotaStore, statsStore
├── pages/            # HomePage, ExplorePage, ProfilePage, AuthPage,
│                     #   ArticlePage, OAuthCallback
├── components/       # articles/, charts/, layout/, profile/, search/, ui/
├── hooks/            # usePagination and other custom hooks
└── types/            # TypeScript types and API interfaces
```

---

## API Endpoints

### Public

| Method | Path | Description |
|---|---|---|
| `GET` | `/articles/` | Paginated list from the thematic collection (`page`, `size`, `keyword`, `search`) |
| `GET` | `/articles/stats` | Aggregated collection statistics (by year, journal, country, type) |
| `GET` | `/articles/{id}` | Article detail card |
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

### Private (require JWT)

| Method | Path | Description |
|---|---|---|
| `GET` | `/articles/find` | Live search in Scopus (up to 25 articles); checks quota; saves articles and history |
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

Current migration version: `0007_drop_article_legacy_columns`.

| Table | Purpose | Records (prod) |
|---|---|---|
| `articles` | Normalized Scopus publication registry | ~39,800 |
| `catalog_articles` | Thematic collection membership (seeder keyword) | ~39,500 |
| `search_history` | User live-search history (JSONB `filters`) | ~14 |
| `search_result_articles` | Junction table: search → articles with `rank` | ~350 |
| `seeder_keywords` | Used seeder phrases with clusters and timestamps | ~4,750 |
| `users` | Service users | ~9 |
| `refresh_tokens` | Active refresh tokens with rotation support | ~133 |

---

## Authentication and Security

- **Access Token** — Bearer JWT, lives 30 minutes, stored in `localStorage`.
- **Refresh Token** — stored in an `httpOnly; Secure; SameSite=None` cookie (30 days); rotation is supported on every `/auth/refresh` call. Revocation via `/auth/logout`.
- **Silent refresh** — Axios interceptor on the frontend catches 401, calls `POST /auth/refresh` exactly once (Promise singleton prevents race condition), then retries the original request.
- **Google OAuth** — Authlib + Starlette SessionMiddleware; state stored in a signed cookie — CSRF protection.
- **CSRF guard** on `/auth/refresh` — `X-Requested-With: XMLHttpRequest` header is required.
- **CORS** — strict list of origins from `ALLOWED_ORIGINS`; wildcard `*` with `credentials: true` is not used.
- **Seeder** — authenticated via static `X-Seeder-Secret` header (not a user JWT).
- Sensitive fields (`input`) are stripped from Pydantic 422 responses via a custom exception handler.

---

## Automated Seeder

A daily GitHub Actions workflow populates the thematic collection without consuming user quota.

**Algorithm:**
1. Determine the thematic cluster for the day (rotating schedule).
2. Read already-used phrases for the active cluster from `seeder_keywords`.
3. Generate up to 120 new unique search phrases via OpenRouter API (LLM).
4. Call `POST /seeder/seed` on the Railway backend for each phrase.
5. The backend queries Scopus, atomically saves articles to `articles` + `catalog_articles`, returns `rate_remaining`.
6. The seeder records the result in `seeder_keywords` and stops when `rate_remaining < 500`.

<details>
<summary>Seeder configuration</summary>

Environment variables read by the seeder: `DATABASE_URL`, `SEEDER_SECRET`, `OPENROUTER_API_KEY`, `SEEDER_BASE_URL`.

Parameters in `seed_db.py`: `ARTICLES_PER_QUERY = 25`, `DELAY_BETWEEN_REQUESTS = 2.0` sec, `KEYWORDS_TO_USE = 120`, `RATE_LIMIT_STOP_THRESHOLD = 500`.

Supabase connection via `asyncpg` with `statement_cache_size=0` (required for PgBouncer transaction mode).

</details>

---

## Testing

**Backend:** `pytest` + `pytest-asyncio`; all tests green.

| File | Type | Coverage |
|---|---|---|
| `test_find_articles.py` | Integration (SQLite) | `/articles/find`, quota, history |
| `test_find_articles_postgres.py` | Integration (PG) | `pg_advisory_xact_lock`, parallel requests |
| `test_search_history_api.py` | Integration | History, filters, aggregates |
| `test_article_by_id.py` | Integration | Detail card, public access |
| `test_article_by_id_e2e.py` | E2E (Staging) | Real backend + Supabase staging |
| `test_rt_e2e.py` / `test_rt_edge_cases.py` | E2E / Integration | RT rotation, logout, edge cases |
| `test_articles_api.py` / `test_articles_headers.py` | Integration | Pagination, Rate Limit headers |
| `test_users_api.py` | Integration | Registration, login, profile |

**Frontend:** Vitest; **92/92 tests** green (unit + integration).

<details>
<summary>Running the tests</summary>

```bash
# Backend — SQLite only (no PostgreSQL required)
pytest tests -vv -m "not requires_pg"

# Backend — all tests (PostgreSQL required)
pytest tests -vv

# Frontend
cd frontend
npm run test
```

</details>

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
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
# Configure .env based on .env.example
alembic upgrade head
uvicorn app.main:app --reload
```

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

> **Before publishing:** scan the README and `.env.example` for real domains, email addresses, tokens, and any secret-like strings — replace all such values with neutral placeholders.

</details>
