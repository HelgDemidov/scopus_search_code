# Scopus Search API

[![Python Tests](https://github.com/HelgDemidov/scopus_search_code/actions/workflows/tests.yml/badge.svg)](https://github.com/HelgDemidov/scopus_search_code/actions/workflows/tests.yml)

Russian version: [README.ru.md](README.ru.md)

Scopus Search API is a learning fullstack project for searching, storing, filtering, and visualizing academic publications from the Scopus database. The repository includes not only a FastAPI backend, but also a React/Vite frontend with a private user profile, a public article feed, an analytics Explore section, and live search integration via the Scopus API.

The project is built around two scenarios: **accumulating a local database of publications** and **live search for new articles through Scopus**. The backend handles authentication, data access, aggregation, and Scopus integration; the frontend provides a user-friendly interface with filters, charts, and protected user sections.

---

## What Is Already Implemented

### Backend

- FastAPI application with `users`, `auth`, `articles`, and `health` routers
- JWT authentication with access token and refresh token in an `httpOnly` cookie
- Registration, login, current user profile, and password reset request
- Public paginated retrieval of stored articles from PostgreSQL
- Public aggregated statistics over the accumulated article database
- Private live search via Scopus API: `GET /articles/find`
- Async stack: SQLAlchemy 2.0 + asyncpg + Alembic
- Repository pattern, DI, and strict layer separation

### Frontend

- React + TypeScript + Vite SPA
- Routes: `/`, `/explore`, `/profile`, `/auth`, `/article/:id`
- Home page with a search bar, filters, and article list
- Explore page with KPI cards and charts over the accumulated database
- Current user profile page
- Auth page: login, registration, Google OAuth
- Zustand stores for auth, articles, and stats
- Axios client with automatic access token refresh

### Infrastructure

- PostgreSQL 16 (Supabase)
- Railway for application deployment
- GitHub Actions for tests and the automated seeder
- Docker / Docker Compose for local development

---

## Current Project Status

The project has already grown beyond the scope of the original minimal requirements for a "REST API for article search." It is effectively a **fullstack system for working with academic publications**, where the backend stores and aggregates data and the frontend provides a UI for search and analysis.

At the same time, some new product features are still in development. The codebase currently **does not yet include** a `search_history` table, weekly per-user live search quotas, dedicated search history endpoints, or a full display of this data in the user profile. The README below describes both the **existing implementation** and the **current context for the upcoming update**.

---

## Scope of Work and Its Evolution

The original requirements called for a backend service with the following capabilities:

- user registration and authentication;
- retrieval of the current user;
- Scopus API integration for searching publications;
- storing results in PostgreSQL;
- a public article list endpoint with pagination;
- Swagger documentation;
- Docker Compose setup;
- a README with setup and launch instructions.

These requirements are complete. Additionally, the project now includes a frontend, analytics charts, refresh token flow, Google OAuth, and an automated seeder for regular database population.

---

## Technology Stack

### Backend

- Python 3.12+
- FastAPI
- SQLAlchemy 2.0 (async)
- Alembic
- PostgreSQL 16 / Supabase
- asyncpg
- Pydantic v2
- PyJWT
- pwdlib / bcrypt / argon2
- httpx

### Frontend

- React 19
- TypeScript
- Vite
- React Router
- Zustand
- Axios
- Recharts
- shadcn/ui
- Tailwind CSS
- Zod
- React Hook Form

### DevOps and Infrastructure

- Docker
- Docker Compose
- Railway
- GitHub Actions
- OpenRouter API (for seeder search phrase generation)

---

## Project Architecture

The backend is structured as a multi-layer application with a clear separation of responsibilities between the HTTP layer, business logic, infrastructure, and data models.

### Backend Application Layers

1. **Routers** — accept HTTP requests, validate input, call services, and return responses.
2. **Services** — contain the business logic of user scenarios.
3. **Infrastructure / Repositories** — encapsulate access to PostgreSQL and external services.
4. **Models** — ORM models of database tables.
5. **Schemas** — Pydantic schemas for requests and responses.
6. **Core** — security, dependencies, refresh-token utilities, configuration.

### Current Repository Structure

```text
scopus_search_code/
├── app/                              # Backend application source code
│   ├── core/                         # Security, DI, refresh-token utilities
│   ├── infrastructure/               # PostgreSQL repositories and Scopus client
│   ├── interfaces/                   # Abstractions for repositories and external clients
│   ├── models/                       # ORM models: article, user, refresh_token, seeder_keyword, base
│   ├── routers/                      # HTTP endpoints: users, auth, articles, health
│   ├── schemas/                      # Pydantic schemas for requests and responses
│   └── services/                     # Business logic built on top of interfaces
├── alembic/                          # Database migrations (Alembic + Supabase Postgres)
│   └── versions/                     # Migration revision files
├── db_seeder/                        # Automated database seeder
│   └── seeder__scripts/              # Seeder scripts
│       ├── seed_db.py                # Orchestrator: login, Scopus requests, article storage
│       └── keyword_generator.py     # LLM-based search phrase generator (OpenRouter)
├── docs/                             # Documentation and analysis artifacts
│   ├── project_mask/                 # Codebase masks for LLM analysis
│   └── project_tree/                 # Project structure snapshots
├── frontend/                         # React + TypeScript + Vite SPA client
│   ├── src/                          # Frontend source code
│   │   ├── api/                      # Axios client and API call functions
│   │   ├── components/               # UI components (articles, charts, search, ui)
│   │   ├── hooks/                    # Custom React hooks
│   │   ├── pages/                    # Pages: Home, Explore, Profile, Auth, Article
│   │   ├── stores/                   # Zustand stores: auth, articles, stats
│   │   └── types/                    # TypeScript types and API interfaces
├── tests/                            # Automated tests
│   ├── integration/                  # Integration tests (HTTP + DB + external clients)
│   └── unit/                         # Unit tests (isolated business logic)
├── .github/
│   └── workflows/                    # GitHub Actions: tests, linters, coverage, seeder
├── .coveragerc                       # coverage.py configuration
├── .dockerignore                     # Docker build context exclusions
├── .env.example                      # Environment variables template
├── .gitignore                        # Git ignore rules
├── .importlinter                     # import-linter configuration (architectural dependency control)
├── alembic.ini                       # Alembic configuration (database connection string)
├── docker-compose.yml                # Docker Compose for local development
├── Dockerfile                        # Docker image for the FastAPI application
├── entrypoint.sh                     # Container entrypoint: migrations + uvicorn startup
├── pyproject.toml                    # Tool configuration: ruff, mypy, import-linter
├── pytest.ini                        # Pytest configuration
├── requirements.txt                  # Python dependencies
├── README.md                         # Project documentation (English version)
└── README.ru.md                      # Project documentation (Russian version)
```

> Note: in the current branch, the backend lives in `app/`, not `backend/app/`. The frontend lives in `frontend/`.

---

## Database and Models

The following ORM models are currently active in the codebase:

- `User` — users (`users`)
- `Article` — stored publications (`articles`)
- `RefreshToken` — refresh tokens (`refresh_tokens`)
- `SeederKeyword` — seeder search phrase history (`seeder_keywords`)

### What Is Stored in `users`

The current users table contains:

- `id`
- `username`
- `email`
- `hashed_password`
- `created_at`

As of this README update, the `search_history` table **does not yet exist** in the project. This is relevant for the upcoming development of the user profile and search history functionality.

---

## Implemented Backend Endpoints

### Users

- `POST /users/register` — register a new user
- `POST /users/login` — log in, return access token and set refresh token cookie
- `GET /users/me` — retrieve the current user by bearer token
- `POST /users/password-reset-request` — request a password reset

### Auth

- `GET /auth/google/login` — initiate the Google OAuth flow
- `GET /auth/google/callback` — callback after Google authorization
- `POST /auth/refresh` — refresh the access token using the refresh token cookie
- `POST /auth/logout` — revoke the refresh token and clear the cookie

### Articles

- `GET /articles/` — public paginated list of stored articles
- `GET /articles/stats` — aggregated statistics over the accumulated database
- `GET /articles/search/stats` — statistics for a specific search query
- `GET /articles/find` — private live search in the Scopus API with result storage
- `GET /articles/{article_id}` — retrieve an article by id

### Health

- `GET /health` — application health check

---

## Implemented Frontend

The frontend is already a fully realized part of the project and should be described in the README as a primary application layer, not as future work.

### Application Routes

- `/` — home page with search, filters, and article list
- `/explore` — analytics section with KPI cards and charts
- `/profile` — authenticated user profile
- `/auth` — login / registration / Google OAuth page
- `/article/:id` — article detail page

### Key Components and Features

- `SearchBar` — search input
- `ArticleFilters` — filtering by year, document type, open access, and country
- `ArticleList` — paginated list of article cards
- `SearchResultsDashboard` — mini-dashboard for search results
- `ScopusQuotaBadge` — displays quota metadata received from the Scopus API
- `ProfilePage` — current user profile
- `ExplorePage` — accumulated statistics visualization through charts

### Charts in Explore

The `frontend/src/components/charts/` directory already contains visualization components for:

- publications by year;
- document types;
- top countries;
- top journals;
- top keywords.

---

## Authentication and Security

The project uses a combined authentication scheme:

- **Access token** is passed as a Bearer JWT;
- **Refresh token** is stored in an `httpOnly` cookie;
- refresh token rotation is supported;
- access to private scenarios is protected via the `get_current_user` dependency.

This is particularly relevant for live Scopus search: the `/articles/find` endpoint is already private and requires authentication. This means the business rule "only an authenticated user may perform live search" is already enforced at the backend level.

---

## Cloud Database (Supabase)

The project connects to PostgreSQL through a single environment variable `DATABASE_URL`.

Two connection scenarios are used:

- **Session Pooler** — for the FastAPI application with SQLAlchemy;
- **Transaction Pooler** — for the seeder's short-lived connections.

Tests do not use Supabase: the test environment uses in-memory SQLite and mocks all real external dependencies.

---

## Automated Database Seeder

The project includes an automated seeder that regularly populates the local article database via GitHub Actions.

### How the Seeder Works

1. Logs in to the application.
2. Obtains a JWT for access to the private `GET /articles/find`.
3. Reads already-used search phrases from `seeder_keywords`.
4. Generates new search phrases via the OpenRouter API.
5. Sequentially sends requests to the Scopus live search.
6. Stores articles and records the history of used keyword phrases.

### Practical Purpose

This allows the project to operate in two modes:

- as a search interface over a locally accumulated article database;
- as a client for live search of new publications through Scopus.

---

## Environment Configuration

Before running the application, create a `.env` file based on `.env.example`.

Safe configuration template:

```env
SCOPUS_API_KEY=YOUR_SCOPUS_API_KEY
DATABASE_URL=postgresql+asyncpg://user:password@your-instance.example.com:5432/postgres
SECRET_KEY=YOUR_SECRET_KEY
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30

# OAuth / frontend / auth redirect variables
GOOGLE_CLIENT_ID=YOUR_GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET=YOUR_GOOGLE_CLIENT_SECRET
GOOGLE_REDIRECT_URI=https://your-instance.example.com/auth/google/callback
FRONTEND_URL=http://localhost:5173

# Seeder only
SEEDER_EMAIL=user@example.com
SEEDER_PASSWORD=YOUR_SEEDER_PASSWORD
OPENROUTER_API_KEY=YOUR_OPENROUTER_API_KEY
```

> Before publishing documentation, always scan the README and `.env.example` for real domains, email addresses, tokens, logins, and any long secret-like strings. All such values must be replaced with neutral placeholders.

---

## Local Backend Launch

### Via Docker Compose

```bash
docker compose up --build
```

After startup, the API will be available at `http://localhost:8000` and Swagger UI at `http://localhost:8000/docs`.

### Without Docker

1. Create a virtual environment:

```bash
python -m venv .venv
source .venv/bin/activate
```

2. Install dependencies:

```bash
pip install -r requirements.txt
```

3. Configure `.env`

4. Apply migrations:

```bash
alembic upgrade head
```

5. Start the backend:

```bash
uvicorn app.main:app --reload
```

---

## Local Frontend Launch

If the frontend is run separately from the backend, use the standard Vite flow from the `frontend/` directory:

```bash
cd frontend
npm install
npm run dev
```

The frontend will typically be available at `http://localhost:5173`.

---

## Testing

The project is covered by unit and integration tests using `pytest` and `pytest-asyncio`.

### What Is Tested

- user service logic;
- `/users` and `/articles` routes;
- Pydantic → Service → Repository interaction;
- authentication scenarios;
- application behavior without connecting to the real Supabase database.

### Running the Tests

```bash
pytest tests -vv
```

---

## Current Context for the Next README Update

A summary of key areas already captured during codebase analysis that should be reflected in upcoming product changes.

| Area | What exists now | What is still to be implemented |
|---|---|---|
| User profile | `GET /users/me`, `ProfilePage`, logout | search history, quotas, richer dashboard |
| Scopus live search | private `GET /articles/find` | per-user weekly quotas |
| Article filtering | year, document type, OA, country | possible expansion of filter set |
| Explore analytics | KPI + charts over accumulated database | mode switching / user-level analytics |
| Search history | UI placeholder | `search_history` table, migration, API, frontend integration |
| Quota UX | `ScopusQuotaBadge` for Scopus API response | separate per-user quota counter |

---

## What Is Not Yet Implemented

To avoid misleading readers, current gaps are explicitly listed:

- no ORM model or `search_history` table;
- no dedicated backend endpoint for user search history;
- no per-user weekly live search request limit;
- no dedicated endpoint for a user quota indicator;
- search history in the user profile is currently a UI placeholder;
- parts of the interface text are not yet unified by language.

---

## Requirements Compliance

### Completed

- [x] User registration and authentication (JWT)
- [x] Retrieve current user profile
- [x] Scopus API integration
- [x] Store publications in PostgreSQL
- [x] Public paginated article retrieval
- [x] Swagger documentation
- [x] Docker Compose setup
- [x] README with setup and launch instructions
- [x] Test coverage

### Beyond the Original Requirements

- [x] React/Vite frontend application
- [x] Explore section with analytics charts
- [x] Refresh token flow via `httpOnly` cookie
- [x] Google OAuth
- [x] Automated article database seeder via GitHub Actions

---

## Roadmap

The most logical next steps for the project:

1. add the `search_history` table and an Alembic migration;
2. implement backend endpoints for search history and quota;
3. connect search history and limits in `ProfilePage`;
4. complete UI language unification;
5. expand Explore analytics with new viewing modes;
6. update README.md and README.ru.md in sync after product changes.