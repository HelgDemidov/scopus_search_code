# Scopus Search API

[![Python Tests](https://github.com/HelgDemidov/scopus_search_code/actions/workflows/tests.yml/badge.svg)](https://github.com/HelgDemidov/scopus_search_code/actions/workflows/tests.yml)

Russian version: [README.ru.md](README.ru.md)

A learning REST API service for searching, storing, and displaying scientific publications from the Scopus database.
Built with Python, FastAPI, and PostgreSQL.

The project architecture is designed around **SOLID** principles: strict layer separation, Repository pattern, Dependency Injection.

---

## Scope of Work

This project implements an API for a web application with the following functionality:

- **Authentication:** user registration and login (fields: name and email), retrieval of the currently authenticated user's profile.
- **Scopus API integration:** a private `/find` endpoint for keyword-based article search. The service queries the Scopus API, retrieves the first 10 results, and stores the fields `publicationName`, `coverDate`, `creator`, and `doi` in a local database.
- **Data retrieval:** a public `/articles` endpoint that returns stored results as JSON with pagination support and a total record count.
- **Infrastructure:** PostgreSQL as the data store, Swagger documentation, Docker Compose setup, and this README.

---

## Technology Stack

- **Language:** Python 3.12+
- **Framework:** FastAPI
- **Database:** PostgreSQL 16
- **ORM and Migrations:** SQLAlchemy 2.0 (async), Alembic
- **Authentication:** JWT (PyJWT), bcrypt/argon2 (pwdlib)
- **HTTP Client:** httpx (async)
- **Infrastructure:** Docker, Docker Compose

## Cloud Database (Supabase)

The project initially used a local PostgreSQL instance (via Docker Compose). 
It has now been migrated to a managed PostgreSQL instance on Supabase, 
without changing the core architecture or the test setup.

Key points:

- The application connects to the database using a **single connection string** `DATABASE_URL`.
- The stack is fully asynchronous: SQLAlchemy async + `asyncpg` driver.
- For Supabase it is recommended to use the **Session Pooler** (IPv4‑compatible connection pool).
- Unit and integration tests still rely on **in‑memory SQLite** via `tests/conftest.py` and 
  never touch the cloud database.

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
│   ├── core/                         # Core utilities: security, dependency injection
│   ├── infrastructure/               # Infrastructure layer: DB engine, repositories, Scopus client
│   ├── models/                       # ORM models (database schema)
│   ├── routers/                      # FastAPI routers (HTTP controllers)
│   ├── schemas/                      # Pydantic schemas (request/response validation)
│   └── services/                     # Business logic and abstractions
│       └── interfaces/               # Abstract interfaces (IUserRepository, IArticleRepository, ISearchClient)
├── tests/                            # Automated tests
│   ├── integration/                  # Integration tests (API + DB + external clients)
│   └── unit/                         # Unit tests (isolated business logic)
├── alembic/                          # Database migrations (Alembic, targeting Supabase Postgres)
│   └── versions/                     # Migration revision files
├── .github/                          # CI/CD configuration for GitHub
│   └── workflows/                    # GitHub Actions (tests, linters, coverage)
├── .env                              # Local environment variables (Supabase DATABASE_URL, secrets, not committed)
├── .env.example                      # Environment template (DATABASE_URL format for local and cloud DB)
├── .gitignore                        # Git ignore rules (cache, virtualenv, secrets, etc.)
├── alembic.ini                       # Alembic configuration (reads DATABASE_URL via app.config)
├── docker-compose.yml                # Docker orchestration (app container; local Postgres service now disabled/commented)
├── Dockerfile                        # Docker image build for the FastAPI application
├── export_skeleton.py                # Utility for exporting the project "mask" (AST-based)
├── pytest.ini                        # Pytest configuration (test run options)
├── requirements.txt                  # Python dependencies (FastAPI, async SQLAlchemy, asyncpg, pytest, mypy, ruff, etc.)
├── README.md                         # Project documentation in Russian
└── README.en.md                      # Project documentation in English

```

## Environment configuration

Before running the application, create a `.env` file in the project root based on `.env.example`.

Key environment variables:

```env
SCOPUS_API_KEY=your_scopus_api_key_here

---

# Single database connection string.
# Local PostgreSQL example:
# DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/testdb
# Supabase example (Session Pooler):
# DATABASE_URL=postgresql+asyncpg://your_user:your_password@your_host.supabase.co:5432/your_database
# DATABASE_URL=...

SECRET_KEY=your_super_secret_key_for_jwt_generation
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30

Important: if your password contains special characters (#, %, @, +, $, ,, ?, etc.), they must be URL‑encoded, e.g. # → %23, + → %2B, $ → %24

```
## Running with Docker Compose

Docker Compose is used to containerize the application. 
Previously, `docker-compose.yml` also started a local PostgreSQL container, 
but after migrating to Supabase the local database is no longer required.

In `docker-compose.yml`:

- the `app` service (FastAPI application) remains active;
- the local `db` service can be disabled (it is commented out in the configuration).

Before starting the stack, ensure that `DATABASE_URL` is configured in `.env` (either pointing to a local PostgreSQL instance or to the Supabase database):

```bash
docker compose up --build
```
The application will be available at http://localhost:8000.
---

## Local development without Docker

1. Make sure you have a database available:
   - either a local PostgreSQL instance (a database like `testdb` created),
   - or a cloud Supabase database (project created and connection string obtained).

2. Create and activate a virtual environment:
```bash
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS / Linux:
source .venv/bin/activate
```
3. Install dependencies:
```bash
pip install -r requirements.txt

4. Create a .env file from .env.example and set a valid DATABASE_URL.

5. Apply Alembic migrations (tables will be created in the database pointed to by DATABASE_URL):
```bash
alembic upgrade head

6. Start the development server:
```bash
uvicorn app.main:app --reload

7. Open Swagger UI at http://127.0.0.1:8000/docs and test the /users and /articles endpoints.
```

---

## API Endpoints

### Authentication

- `POST /users/register` — register a new user
- `POST /users/login` — log in and receive a JWT token
- `GET /users/me` — retrieve the current user's profile (requires a valid token in the header)
- `POST /users/password-reset-request` — request a password reset

### Articles

- `GET /articles/find?keyword={kw}` — search Scopus for articles by keyword, save results to the database, and return up to 10 records
- `GET /articles/?page=1&size=10` — retrieve stored articles from the local database with pagination (public endpoint)

---

## Requirements Compliance

- [x] User registration and authentication (JWT)
- [x] Retrieve current user profile
- [x] Search publications via Scopus API (TITLE-ABS-KEY), save first 10 results
- [x] Store fields: publicationName, coverDate, creator, doi — in PostgreSQL
- [x] Public `/articles` endpoint with pagination and `total` field
- [x] Swagger documentation
- [x] Docker Compose setup
- [x] README with setup and launch instructions
- [x] Test coverage: write unit and integration tests using pytest, code coverage 80%
---

## Testing

The project is covered by automated tests using `pytest` and `pytest-asyncio`. The testing strategy follows the testing pyramid and is divided into two levels:

- **Unit Tests (`tests/unit/`)**: Isolated testing of business logic (`UserService`, `ArticleService`). External dependencies (repositories, password hashing functions) are replaced using Fake objects and mocks (`monkeypatch`), ensuring tests run in fractions of a millisecond.
- **Integration Tests (`tests/integration/`)**: Testing of FastAPI HTTP endpoints (`/users`, `/articles`). Verifies the full request cycle: Pydantic validation -> Services -> Repositories. To isolate state, an In-memory `SQLite` database is used, which is automatically set up and torn down via fixtures for each test. Calls to the external Scopus API are mocked.

> Note: CI tests (GitHub Actions) do **not** connect to Supabase. 
> The workflow file uses a dummy `DATABASE_URL`, and the actual tests override 
> the database connection to use in‑memory SQLite via `tests/conftest.py`. 
> This ensures that the cloud database is never modified during CI runs.

**Running the tests:**

```bash
# Activate your virtual environment and run:
pytest tests -vv

```
---

## Planned Development

- **Frontend client** — build a visual user interface (React or Vue.js) for convenient article search and browsing.
