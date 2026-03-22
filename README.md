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
scopus-search/
│
├── app/
│   ├── core/               # DI session factory, security (JWT, password hashing)
│   ├── infrastructure/     # DB connection, repository implementations, Scopus API client
│   ├── models/             # SQLAlchemy ORM models (User, Article)
│   ├── routers/            # HTTP endpoints (users.py, articles.py)
│   ├── schemas/            # Pydantic schemas for request validation and response formatting
│   ├── services/           # Business logic
│   │   └── interfaces/     # Abstract interfaces (IUserRepository, IArticleRepository, ISearchClient)
│   ├── config.py           # Global application settings (pydantic-settings)
│   └── main.py             # Entry point, application assembly, Lifespan management
│
├── alembic/                # Database migrations
├── tests/                  # Integration and unit tests
├── .env                    # Local environment variables (do not commit to Git)
├── .env.example            # Environment variable template for the repository
├── alembic.ini             # Alembic configuration
├── docker-compose.yml      # Container orchestration (DB + App)
├── Dockerfile              # Application image build instructions
├── requirements.txt        # Python dependencies
└── README.md
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