# Scopus Search API

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
├── app/                             # Source code of the application
│   ├── core/                        # Core components: security, dependency injection
│   │   ├── dependencies.py          # DB session factories and common Depends
│   │   └── security.py              # JWT settings, hashing, oauth2_scheme setup
│   ├── infrastructure/              # Concrete implementations of external systems (DB, API)
│   │   ├── database.py              # SQLAlchemy engine and async_session setup
│   │   ├── postgres_article_repo.py # SQL queries for articles
│   │   ├── postgres_user_repo.py    # SQL queries for users
│   │   └── scopus_client.py         # HTTP client for Scopus (via httpx)
│   ├── models/                      # ORM models (Database schema definition)
│   │   ├── article.py               # Article model (SQLAlchemy)
│   │   └── user.py                  # User model (SQLAlchemy)
│   ├── routers/                     # HTTP endpoints (Controllers)
│   │   ├── articles.py              # Routes for GET /articles, GET /articles/find
│   │   └── users.py                 # Routes for POST /register, /login, GET /me
│   ├── schemas/                     # Pydantic models (Input/Output validation)
│   │   ├── article_schemas.py       # Schemas for articles (Response, Paginated)
│   │   └── user_schemas.py          # Schemas for users (Register, Login, Token)
│   ├── services/                    # Business logic (Agnostic of web/DB details)
│   │   ├── interfaces/              # Abstract classes (for Dependency Inversion)
│   │   │   ├── article_repository.py# IArticleRepository
│   │   │   ├── search_client.py     # ISearchClient
│   │   │   └── user_repository.py   # IUserRepository
│   │   ├── article_service.py       # Article logic (e.g., pagination calculation)
│   │   ├── search_service.py        # Search orchestration (Scopus -> DB)
│   │   └── user_service.py          # User logic (registration, password verification)
│   ├── config.py                    # Global application settings (pydantic-settings)
│   └── main.py                      # Application entry point, FastAPI instance assembly
├── tests/                           # Directory for automated tests
│   ├── integration/                 # Integration tests (DB + HTTP layers combined)
│   │   ├── __init__.py              # Integration test package
│   │   ├── test_articles_api.py     # Endpoint tests for articles
│   │   └── test_users_api.py        # Endpoint tests for users
│   ├── unit/                        # Unit tests (Isolated business logic)
│   │   ├── __init__.py              # Unit test package
│   │   ├── test_article_service.py  # Tests for ArticleService using mocks
│   │   └── test_user_service.py     # Tests for UserService using mocks
│   ├── __init__.py                  # Test package initialization
│   └── conftest.py                  # Shared pytest fixtures (TestClient, mock DBs)
├── alembic/                         # Database migrations directory
│   ├── versions/                    # Migration revision files
│   ├── env.py                       # Alembic environment setup (metadata linkage)
│   └── script.py.mako               # Template for generating new migrations
├── .env                             # Local environment variables (Ignored by Git)
├── .env.example                     # Environment variables template
├── .gitignore                       # Git ignore rules
├── alembic.ini                      # Alembic configuration file
├── docker-compose.yml               # Docker orchestration config (App + DB)
├── Dockerfile                       # Instructions to build the application image
├── export_skeleton.py               # Utility to export codebase "mask" via AST
├── pytest.ini                       # Pytest configuration settings
├── README.md                        # Project documentation
└── requirements.txt                 # Python dependencies
```

---

## Running with Docker Compose (Recommended)

This is the recommended way to run the project, ensuring environment consistency.
Requires [Docker](https://docs.docker.com/get-docker/) to be installed.

**Step 1. Configure environment variables**

Create a `.env` file in the project root (you can copy the structure from `.env.example`) and fill it in:

```
SCOPUS_API_KEY=your_scopus_api_key

DB_HOST=db
DB_PORT=5432
DB_USER=scopus_db_user
DB_PASSWORD=securepassword
DB_NAME=scopus_db

SECRET_KEY=supersecretkey_change_me_in_production
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
```

A free Scopus API key for non-commercial use is available at [dev.elsevier.com](https://dev.elsevier.com).

**Step 2. Build and start**

```bash
docker compose up --build
```

Database migrations (Alembic) are applied automatically when the application container starts.

**Step 3. Verify**

- API: `http://localhost:8000`
- Interactive Swagger documentation: `http://localhost:8000/docs`

---

## Local Development (Without Docker)

To run the project directly via Python:

1. Ensure a local PostgreSQL server is running and the database has been created.
2. In the `.env` file, set `DB_HOST=localhost`.
3. Create and activate a virtual environment:

```bash
python -m venv .venv
.venv\Scripts\activate        # Windows
# source .venv/bin/activate   # macOS / Linux
```

4. Install dependencies:

```bash
pip install -r requirements.txt
```

5. Apply database migrations:

```bash
alembic upgrade head
```

6. Start the development server:

```bash
uvicorn app.main:app --reload
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

---

## Planned Development

- **Frontend client** — build a visual user interface (React or Vue.js) for convenient article search and browsing.
- **Cloud deployment** — migrate the PostgreSQL database from the local environment to a managed cloud database solution and deploy the application to a cloud server.
- **Test coverage** — write unit and integration tests using `pytest` to automate quality control before deployment.