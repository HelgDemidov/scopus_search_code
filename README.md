# Scopus Search API

[![Python Tests](https://github.com/HelgDemidov/scopus_search_code/actions/workflows/tests.yml/badge.svg)](https://github.com/HelgDemidov/scopus_search_code/actions/workflows/tests.yml)

Russian version: [README.ru.md](README.ru.md)

Scopus Search API is a learning fullstack project for searching, saving, filtering, and visualizing academic publications from the Scopus database. The repository includes a FastAPI backend and a React/Vite frontend with a public article feed, a private user profile, an analytics Explore section, and live search via the Scopus API.

The project is built around two scenarios: **accumulating a local database of publications** and **live search for new articles through Scopus**. The backend handles authentication, data access, aggregation, and Scopus integration; the frontend provides a user interface with search, charts, and protected user sections.

---

## What Is Implemented

### Backend

- FastAPI application with `users`, `auth`, `articles`, and `health` routers
- JWT authentication: access token (Bearer) + refresh token in an `httpOnly` cookie, token rotation
- Registration, login, Google OAuth, user profile, password reset request
- Public paginated retrieval of stored articles from PostgreSQL with ILIKE search
- Public aggregated statistics over the accumulated article database
- Private live search via Scopus API: `GET /articles/find` (authenticated users only)
- Weekly per-user live search limit (200 requests); HTTP 429 when exceeded
- `search_history` table: user search history with filters, timestamp, and result count
- Private search history and quota endpoints: `GET /articles/history`, `GET /articles/find/quota`
- Async stack: SQLAlchemy 2.0 + asyncpg + Alembic; repository pattern and DI

### Frontend

- React + TypeScript + Vite SPA; all UI text in Russian
- Routes: `/`, `/explore`, `/profile`, `/auth`, `/article/:id`
- **Home page:** behaviour depends on authentication status:
  - anonymous user — search over the local thematic collection "Artificial Intelligence and Neural Network Technologies"
  - authenticated user — live search via Scopus API (up to 25 articles per request)
  - no filter sidebar on the home page
- **Explore (`/explore`):** analytics in two modes — over the accumulated collection and over the user's personal searches; mode is switched by buttons and persisted in the `?mode=` URL parameter
- **Profile (`/profile`):** search history with date, query, result count, and filter badges; client-side filtering by year, document type, Open Access, and country; weekly Scopus quota counter
- **Auth page (`/auth`):** login, registration, Google OAuth
- **Article page (`/article/:id`):** full publication detail card
- Zustand stores: `authStore`, `articleStore`, `statsStore`, `historyStore`, `quotaStore`
- Axios client with automatic access token refresh

### Infrastructure

- PostgreSQL 16 (Supabase)
- Railway for application deployment
- GitHub Actions: two CI jobs — `test` (SQLite) and `test-pg` (PostgreSQL 16 in a service container)
- Docker / Docker Compose for local development

---

## Technology Stack

### Backend

- Python 3.12+, FastAPI, SQLAlchemy 2.0 (async), Alembic, PostgreSQL 16 / Supabase
- asyncpg, Pydantic v2, PyJWT, pwdlib / bcrypt / argon2, httpx

### Frontend

- React 19, TypeScript, Vite, React Router, Zustand, Axios
- Recharts, shadcn/ui, Tailwind CSS, Zod, React Hook Form

### DevOps and Infrastructure

- Docker, Docker Compose, Railway, GitHub Actions
- OpenRouter API (seeder search phrase generation)

---

## Project Architecture

The backend is structured as a multi-layer application with a clear separation of responsibilities.

### Backend Application Layers

1. **Routers** — accept HTTP requests, validate input, call services.
2. **Services** — business logic of user scenarios.
3. **Infrastructure / Repositories** — encapsulate access to PostgreSQL and external services.
4. **Models** — ORM models of database tables.
5. **Schemas** — Pydantic schemas for requests and responses.
6. **Core** — security, DI, refresh-token utilities, configuration.

### Repository Structure

```text
scopus_search_code/
├── app/                              # Backend application
│   ├── core/                         # Security, DI, refresh-token utilities
│   ├── infrastructure/               # PostgreSQL repositories and Scopus client
│   ├── interfaces/                   # Abstractions for repositories and external clients
│   ├── models/                       # ORM models: article, user, refresh_token,
│   │                                 #   seeder_keyword, search_history, base
│   ├── routers/                      # HTTP endpoints: users, auth, articles, health
│   ├── schemas/                      # Pydantic schemas: article, user, search_history
│   └── services/                     # Business logic: article, search, search_history, user
├── alembic/                          # Alembic migrations (PostgreSQL / Supabase)
│   └── versions/                     # Revision files (0001–0005 + additional)
├── db_seeder/                        # Automated database seeder
│   └── seeder__scripts/
│       ├── seed_db.py                # Orchestrator: login, Scopus requests, article storage
│       └── keyword_generator.py     # LLM-based search phrase generator (OpenRouter)
├── docs/                             # Docs: frontend tech spec, masks, project trees
├── frontend/                         # React + TypeScript + Vite SPA client
│   └── src/
│       ├── api/                      # Axios client and API call functions
│       ├── components/               # UI components (articles, charts, layout, profile, search, ui)
│       ├── hooks/                    # Custom React hooks
│       ├── pages/                    # Pages: Home, Explore, Profile, Auth, Article
│       ├── stores/                   # Zustand stores: auth, articles, stats, history, quota
│       └── types/                    # TypeScript types and API interfaces
├── tests/
│   ├── integration/                  # Integration tests (HTTP + DB + external clients)
│   └── unit/                         # Unit tests (isolated business logic)
├── .github/workflows/                # GitHub Actions: tests (SQLite + PG), seeder
├── docker-compose.yml
├── Dockerfile
├── requirements.txt
├── pyproject.toml                    # ruff, mypy, import-linter
├── pytest.ini
├── README.md
└── README.ru.md
```

> The backend lives in `app/`, the frontend in `frontend/`.

---

## Database and Models

Active ORM models and their corresponding PostgreSQL tables:

| Model | Table | Purpose |
|---|---|---|
| `User` | `users` | Service users |
| `Article` | `articles` | Stored publications |
| `RefreshToken` | `refresh_tokens` | Authentication refresh tokens |
| `SeederKeyword` | `seeder_keywords` | Seeder search phrase history |
| `SearchHistory` | `search_history` | User live-search history |

<details>
<summary>Details on the <code>search_history</code> table</summary>

Columns: `id`, `user_id` (FK → `users.id` ON DELETE CASCADE), `query`, `created_at`, `result_count`, `filters` (JSONB, `default '{}'`).

Composite index: `(user_id, created_at DESC)` — created by migration `0005_add_search_history.py`.

A record is inserted only on a successful Scopus API response, within the same transaction as article storage. If Scopus returns an error, the record is not created (transaction rollback).

</details>

---

## Backend Endpoints

### Users

- `POST /users/register` — register a new user
- `POST /users/login` — log in, return access token and set refresh token cookie
- `GET /users/me` — retrieve the current user
- `POST /users/password-reset-request` — request a password reset

### Auth

- `GET /auth/google/login` — initiate the Google OAuth flow
- `GET /auth/google/callback` — callback after Google authorization
- `POST /auth/refresh` — refresh the access token using the refresh token cookie
- `POST /auth/logout` — revoke the refresh token and clear the cookie

### Articles

- `GET /articles/` — public paginated article list; supports `keyword` (seeder field filter) and `search` (ILIKE over title / author)
- `GET /articles/stats` — aggregated statistics over the accumulated database (public)
- `GET /articles/search/stats` — statistics for a specific search query (private)
- `GET /articles/find` — live search in Scopus API, up to 25 results; saves articles and a `search_history` record; enforces the weekly quota (private)
- `GET /articles/history` — current user's search history, up to 100 records (private)
- `GET /articles/find/quota` — weekly quota usage: `limit`, `used`, `remaining`, `reset_at` (private)
- `GET /articles/{article_id}` — retrieve one article by id (public)

### Health

- `GET /health` — health check

<details>
<summary>Quota and concurrent access details</summary>

The weekly limit is 200 live searches per user. When exceeded, the endpoint returns HTTP 429 without calling Scopus and without inserting a history record.

To prevent race conditions on concurrent requests from the same user, `pg_advisory_xact_lock(user_id)` is called before the quota check. The lock is acquired and released within the same transaction, ensuring the 201st request receives a 429 even under parallel access.

</details>

---

## Frontend: Key Scenarios

### Home Page `/`

Behaviour depends on authentication status. There is no filter sidebar on the home page.

**Anonymous user** sees a banner:
> "Search without authentication is performed over the thematic collection 'Artificial Intelligence and Neural Network Technologies'. To search the global Scopus database, please log in."

Search is performed via `GET /articles/` against the local database.

**Authenticated user** sees a banner:
> "Live Scopus search results are limited to 25 articles per request."

Search is performed via `GET /articles/find` (Scopus API, live results). When the quota is exhausted (HTTP 429 from the backend), a toast notification is shown: "Weekly search limit reached".

### Explore `/explore`

The section operates in two modes, toggled by buttons; the mode is persisted in the `?mode=` URL parameter.

| Mode | Data | Access |
|---|---|---|
| By collection (default) | `GET /articles/stats` — aggregates over the accumulated database | everyone |
| By my searches | client-side aggregation of `historyStore` over user history | authenticated only |

KPIs in "By my searches" mode: number of queries, total articles found, number of countries and document types. The mode switcher is only visible to authenticated users; anonymous users always see the "By collection" mode.

### Profile `/profile`

On mount, the page loads search history (`GET /articles/history`) and quota (`GET /articles/find/quota`).

**`LiveSearchQuotaCounter`** — displays `limit`, `used`, `remaining`, and the `reset_at` date as four cells.

**`SearchHistoryList`** — list of records with query, date, result count, and filter badges. Supports client-side filtering by year, document type, Open Access, and affiliation country. The "Go to analytics by my searches" link leads to `/explore?mode=personal`.

<details>
<summary>Client-side filter architecture (historyStore / articleStore)</summary>

Server-side filters (`keyword`, `search`) are stored in `articleStore`. Client-side filters (`yearFrom`, `yearTo`, `docTypes`, `openAccessOnly`, `countries`) are stored in `historyStore` as `HistoryFilters`. `articleStore.fetchArticles()` applies client-side filters to the loaded page via `applyClientFilters()`, reading them from `historyStore.getState()`.

After a successful live search, `articleStore.searchScopusLive()` updates `quotaStore` via `fetchQuota()` (fire-and-forget, does not block search completion).

</details>

---

## Authentication and Security

- **Access token** — short-lived Bearer JWT.
- **Refresh token** — stored in an `httpOnly` cookie, rotation is supported.
- Private endpoints (`/articles/find`, `/articles/history`, `/articles/find/quota`, `/articles/search/stats`) are protected by the `get_current_user` dependency.

---

## Automated Seeder

The seeder regularly populates the local article database via GitHub Actions, operating under a dedicated service user account.

**How it works:**
1. Log in to the application, obtain a JWT.
2. Read already-used phrases from `seeder_keywords`.
3. Generate new search phrases via the OpenRouter API (LLM).
4. Sequentially send requests to `GET /articles/find`.
5. Save articles and record used phrases in `seeder_keywords`.

This allows the project to accumulate a publication database automatically without consuming the per-user weekly quota.

---

## Cloud Database (Supabase)

The project connects to PostgreSQL via the `DATABASE_URL` environment variable. Two connection modes are used:

- **Session Pooler** — for the FastAPI application (SQLAlchemy + asyncpg).
- **Transaction Pooler** — for the seeder (short-lived connections).

Tests do not use Supabase: unit tests run on SQLite in-memory; integration PostgreSQL tests (marked `@pytest.mark.requires_pg`) run against a PostgreSQL 16 service container in GitHub Actions.

---

## Testing

The project is covered by unit and integration tests using `pytest` + `pytest-asyncio`.

<details>
<summary>What is tested</summary>

- Service logic: users, search, search history (`SearchHistoryService`).
- Routes `/users` and `/articles` (including `find`, `history`, `find/quota`).
- Repository: `FakeSearchHistoryRepository` (9 unit tests), `PostgresSearchHistoryRepository` (9 integration tests, `requires_pg`).
- Concurrent access and `pg_advisory_xact_lock` (3 PG tests: "exactly one slot", lock isolation across different users).
- Authentication scenarios; operation without connecting to the real Supabase database.

</details>

### Running the Tests

```bash
# SQLite tests only (no PostgreSQL required)
pytest tests -vv -m "not requires_pg"

# All tests (PostgreSQL required)
pytest tests -vv
```

---

## Environment Configuration

Create a `.env` file based on `.env.example`:

```env
SCOPUS_API_KEY=YOUR_SCOPUS_API_KEY
DATABASE_URL=postgresql+asyncpg://user:password@your-instance.example.com:5432/postgres
SECRET_KEY=YOUR_SECRET_KEY
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30

GOOGLE_CLIENT_ID=YOUR_GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET=YOUR_GOOGLE_CLIENT_SECRET
GOOGLE_REDIRECT_URI=https://your-instance.example.com/auth/google/callback
FRONTEND_URL=http://localhost:5173

# Seeder only
SEEDER_EMAIL=user@example.com
SEEDER_PASSWORD=YOUR_SEEDER_PASSWORD
OPENROUTER_API_KEY=YOUR_OPENROUTER_API_KEY
```

> Before publishing, scan the README and `.env.example` for real domains, email addresses, tokens, and any secret-like strings — replace all such values with neutral placeholders.

---

## Local Launch

### Backend via Docker Compose

```bash
docker compose up --build
```

API: `http://localhost:8000` · Swagger UI: `http://localhost:8000/docs`

### Backend without Docker

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
# configure .env
alembic upgrade head
uvicorn app.main:app --reload
```

### Frontend

```bash
cd frontend
npm install
npm run dev
# http://localhost:5173
```

---

## Requirements Compliance

<details>
<summary>Original requirements and their status</summary>

The original requirements called for: user registration and authentication, retrieving the current user, Scopus API integration, storing publications in PostgreSQL, a public paginated article list, Swagger documentation, Docker Compose setup, and a README. All completed.

**Implemented beyond the original requirements:**
- React/Vite frontend with a full UI in Russian
- Private live Scopus search with a weekly limit and search history
- Explore section with analytics charts (two modes: collection / personal searches)
- User profile: search history, filtering, quota counter
- Refresh token flow via `httpOnly` cookie, token rotation
- Google OAuth
- Automated article database seeder via GitHub Actions
- CI with two test environments: SQLite and PostgreSQL 16

</details>
