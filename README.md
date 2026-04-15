# Scopus Search API

[![Python Tests](https://github.com/HelgDemidov/scopus_search_code/actions/workflows/tests.yml/badge.svg)](https://github.com/HelgDemidov/scopus_search_code/actions/workflows/tests.yml)

Russian version: [README.ru.md](README.ru.md)

My learning REST API service for searching, storing, and displaying scientific publications from the Scopus database.
Built with Python, FastAPI, and PostgreSQL.

The project architecture is designed around **SOLID** principles: strict layer separation, Repository pattern, Dependency Injection.

---

## Scope of Work

This project implements an API for a web application with the following functionality:

- **Authentication:** user registration and login (fields: name and email), retrieval of the currently authenticated user's profile.
- **Scopus API integration:** a private `/articles/find` endpoint for keyword-based article search. The service queries the Scopus API, retrieves up to 25 first results, and stores the fields `title`, `journal`, `author`, `publication_date`, `doi`, `cited_by_count`, `document_type`, `open_access`, `affiliation_country` in the database.
- **Data retrieval:** a public `/articles` endpoint that returns stored results as JSON with pagination support and a total record count.
- **Infrastructure:** PostgreSQL as the data store, Swagger documentation, Docker Compose setup, and this README.

---

## Technology Stack

- **Language:** Python 3.12+
- **Framework:** FastAPI
- **Database:** PostgreSQL 16 (cloud-hosted — Supabase)
- **ORM and Migrations:** SQLAlchemy 2.0 (async), Alembic
- **Authentication:** JWT (PyJWT), bcrypt/argon2 (pwdlib)
- **HTTP Client:** httpx (async)
- **Deployment:** Railway (auto-deploy from `main` branch via Dockerfile)
- **CI/CD:** GitHub Actions (tests, linters, coverage, automated seeder)
- **Seeder:** OpenRouter API (google/gemini-2.0-flash) — search phrase generation
- **Infrastructure:** Docker, Docker Compose

---

## Cloud Database (Supabase)

The project initially used a local PostgreSQL instance (via Docker Compose).
It has now been migrated to a managed PostgreSQL instance on Supabase,
without changing the core architecture or the test setup.

Key points:

- The application connects to the database using a **single connection string** `DATABASE_URL`.
- The stack is fully asynchronous: SQLAlchemy async + `asyncpg` driver.
- **The pooler type depends on the component:**
  - The FastAPI service (Railway) uses the **Session Pooler** (port 5432) — compatible with long-lived SQLAlchemy connections.
  - The seeder (`seed_db.py`, short-lived asyncpg connections) uses the **Transaction Pooler** (port 6543) with `statement_cache_size=0` for PgBouncer compatibility.
- Unit and integration tests still rely on **in-memory SQLite** via `tests/conftest.py` and never touch the cloud database.

---

## Automated Database Seeder

An automated seeder is implemented to autonomously populate the database with academic articles on a schedule via GitHub Actions.

**How it works (one run):**
1. Auto-login via `POST /users/login` on the Railway service — obtain a JWT token.
2. Load the history of used phrases from the `seeder_keywords` table (Supabase).
3. Generate **120 unique academic search phrases** via OpenRouter API (model `google/gemini-2.0-flash`). A deterministic rotation across 5 thematic clusters by day of week is used: *Large Language Models, Generative Adversarial Networks, Neuromorphic Computing, AI Hardware Accelerators, AutoML and Self-Improving Systems*.
4. Sequential requests to `GET /articles/find` for **100 phrases** with a 2-second pause — up to 25 articles per request.
5. Automatic JWT refresh on token expiry (401); stops when the Scopus quota drops below 500 remaining requests.
6. Each used phrase is recorded in `seeder_keywords` with the count of articles found.

**Scripts:** [`db_seeder/seeder__scripts/seed_db.py`](db_seeder/seeder__scripts/seed_db.py) and [`keyword_generator.py`](db_seeder/seeder__scripts/keyword_generator.py).

**Schedule:** daily at **03:00 UTC** (`cron: "0 3 * * *"`), plus manual trigger via `workflow_dispatch`. Secrets (`DATABASE_URL`, `SEEDER_EMAIL`, `SEEDER_PASSWORD`, `OPENROUTER_API_KEY`) are passed via GitHub Secrets.

**Throughput metrics:** up to 2,500 new articles per run, up to ~17,500 per week. LLM phrase generation cost — ~$0.001 per run.

---

## Architecture and Project Structure

The project is divided into four logical layers:

1. **HTTP Layer (Routers)** — accepts HTTP requests; responsible solely for routing and input validation.
2. **Service Layer (Business Logic)** — orchestrates data processing without knowledge of database or network implementation details.
3. **Repository Layer** — abstract interfaces and their concrete implementations for database access.
4. **External Client Layer** — isolated logic for communicating with the third-party Scopus API.

### File Structure

```
scopus_search_code/
├── app/                              # Application source code
│   ├── core/                         # Core: configuration, security, DI (dependencies)
│   ├── infrastructure/               # Infrastructure: database, repositories, Scopus client
│   ├── interfaces/                   # Domain abstractions: repositories and external clients
│   ├── models/                       # ORM models (article, user, seeder_keyword, base)
│   ├── routers/                      # HTTP endpoints (FastAPI controllers)
│   ├── schemas/                      # Pydantic schemas (request/response validation)
│   └── services/                     # Business logic built on top of interfaces
├── db_seeder/                        # Automated database seeder
│   └── seeder__scripts/
│       ├── seed_db.py                # Orchestrator: login, Scopus requests, storage
│       └── keyword_generator.py     # LLM-based search phrase generator (OpenRouter)
├── docs/                             # Documentation and analysis artifacts
│   ├── project_mask/                 # Codebase masks for LLM analysis
│   └── project_tree/                 # Project structure snapshots
├── tests/                            # Automated tests
│   ├── integration/                  # Integration tests (HTTP + DB + external clients)
│   └── unit/                         # Unit tests (isolated business logic)
├── alembic/                          # Database migrations (Alembic, Supabase Postgres)
│   └── versions/                     # Migration revision files
├── .github/
│   └── workflows/                    # GitHub Actions: tests, linters, coverage, seeder
├── .coveragerc                       # coverage.py configuration
├── .dockerignore                     # Docker build context exclusions
├── .env                              # Local environment variables (not committed)
├── .env.example                      # Environment variables template
├── .gitignore                        # Git ignore rules
├── .importlinter                     # import-linter configuration (dependency control)
├── alembic.ini                       # Alembic configuration (database connection)
├── docker-compose.yml                # Docker Compose (local application launch)
├── Dockerfile                        # Docker image for the FastAPI application
├── pyproject.toml                    # Tool configuration (ruff, mypy, import-linter)
├── pytest.ini                        # Pytest configuration
├── requirements.txt                  # Python dependencies
├── README.md                         # Project documentation (English version)
└── README.ru.md                      # Project documentation (Russian version)
```

---

## Environment Configuration

Before running the application, create a `.env` file in the project root based on `.env.example`.
Key environment variables:

```env
SCOPUS_API_KEY=your_scopus_api_key_here

# Single database connection string.
# Local PostgreSQL:
# DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/testdb
# Supabase Session Pooler (FastAPI service, port 5432):
# DATABASE_URL=postgresql+asyncpg://user:password@host.supabase.co:5432/postgres
# Supabase Transaction Pooler (seeder, port 6543):
# DATABASE_URL=postgresql+asyncpg://user:password@host.supabase.co:6543/postgres
DATABASE_URL=...

SECRET_KEY=your_super_secret_key_for_jwt_generation
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30

# For the seeder only (db_seeder/seeder__scripts/):
# SEEDER_EMAIL=registered_user_email
# SEEDER_PASSWORD=user_password
# OPENROUTER_API_KEY=sk-or-...
```

> **Note:** if your password contains special characters (`#`, `%`, `@`, `+`, `$`, `,`, `?`, etc.),
> they must be URL-encoded, e.g. `#` → `%23`, `+` → `%2B`, `$` → `%24`.

---

## Local Launch with Docker Compose

> **Production deployment** is handled automatically via Railway on every push to `main`.
> Docker Compose is intended for **local development**.

Docker Compose containerizes the application. After migrating to Supabase, the local PostgreSQL container is no longer required — the `db` service can be commented out in `docker-compose.yml`, leaving only the `app` service active.

Ensure `DATABASE_URL` is set correctly in `.env`, then:

```bash
docker compose up --build
```

The application will be available at http://localhost:8000.

---

## Local Development without Docker

<details>
<summary>Expand instructions</summary>

1. Create and activate a virtual environment:
```bash
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS / Linux:
source .venv/bin/activate
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Create `.env` from `.env.example` with a valid `DATABASE_URL`.

4. Apply migrations:
```bash
alembic upgrade head
```

5. Start the development server:
```bash
uvicorn app.main:app --reload
```

Swagger UI is available at http://127.0.0.1:8000/docs.

</details>

---

## API Endpoints

### Authentication

- `POST /users/register` — register a new user
- `POST /users/login` — log in and receive a JWT token
- `GET /users/me` — retrieve the current user's profile (requires a valid token in the header)
- `POST /users/password-reset-request` — request a password reset

### Articles

- `GET /articles/find?keyword={kw}` — search Scopus for articles by keyword, save results to the database, return up to 25 records
- `GET /articles/?page=1&size=10` — retrieve stored articles from the database with pagination (public endpoint)

---

## Requirements Compliance

- [x] User registration and authentication (JWT)
- [x] Retrieve current user profile
- [x] Search publications via Scopus API (TITLE-ABS-KEY), save first 25 results
- [x] Store fields: `title`, `journal`, `author`, `publication_date`, `doi`, `cited_by_count`, `document_type`, `open_access`, `affiliation_country` — in PostgreSQL
- [x] Public `/articles` endpoint with pagination and `total` field
- [x] Swagger documentation
- [x] Docker Compose setup
- [x] README with setup and launch instructions
- [x] Test coverage: unit and integration tests using pytest, code coverage ≥ 80%

---

## Testing

The project is covered by automated tests using `pytest` and `pytest-asyncio`. The testing strategy follows the testing pyramid and is divided into two levels:

- **Unit Tests (`tests/unit/`)**: Isolated testing of business logic (`UserService`, `ArticleService`). External dependencies (repositories, password hashing functions) are replaced using Fake objects and mocks (`monkeypatch`), ensuring tests run in fractions of a millisecond.
- **Integration Tests (`tests/integration/`)**: Testing of FastAPI HTTP endpoints (`/users`, `/articles`). Verifies the full request cycle: Pydantic validation → Services → Repositories. An in-memory SQLite database is used for state isolation, set up and torn down automatically via fixtures for each test. Calls to the external Scopus API are mocked.

> Note: CI tests (GitHub Actions) do **not** connect to Supabase.
> The workflow file uses a dummy `DATABASE_URL`, and the actual tests override
> the database connection to use in-memory SQLite via `tests/conftest.py`.
> This ensures that the cloud database is never modified during CI runs.

**Running the tests:**

```bash
pytest tests -vv
```

---

## Planned Development

- **Frontend client** — a visual user interface for search, article browsing, and an analytics dashboard over the accumulated data. Currently in active development.
