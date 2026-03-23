# Scopus Search API

Версия на английском: [README.md](README.md)

Мой учебный REST API сервис для поиска научных публикаций в базе Scopus, их сохранения и отображения.
Проект реализован на Python с использованием фреймворка FastAPI и базы данных PostgreSQL.

Архитектура проекта построена с упором на принципы **SOLID**: строгое разделение на слои, паттерн Repository, Dependency Injection.

---

## Техническое задание

В рамках проекта разработан API для веб-приложения со следующим функционалом:

- **Аутентификация:** регистрация и авторизация пользователей (поля: имя и email), получение информации о текущем авторизованном пользователе.
- **Интеграция со Scopus API:** приватный эндпоинт `/find` для поиска статей по ключевым словам. Сервис обращается к Scopus API, получает первые 10 публикаций и сохраняет поля `publicationName`, `coverDate`, `creator`, `doi` в локальную базу данных.
- **Вывод данных:** публичный эндпоинт `/articles` для вывода сохранённых результатов в формате JSON с поддержкой пагинации и счётчиком общего числа записей.
- **Инфраструктура:** PostgreSQL в качестве хранилища, Swagger-документация, запуск через Docker Compose, наличие README.

---

## Технологический стек

- **Язык:** Python 3.12+
- **Фреймворк:** FastAPI
- **База данных:** PostgreSQL 16
- **ORM и миграции:** SQLAlchemy 2.0 (async), Alembic
- **Аутентификация:** JWT (PyJWT), bcrypt/argon2 (pwdlib)
- **HTTP-клиент:** httpx (асинхронный)
- **Инфраструктура:** Docker, Docker Compose

---

## Архитектура и структура проекта

Проект разделён на четыре логических слоя:

1. **HTTP Layer (Routers)** — принимает HTTP-запросы, отвечает только за маршрутизацию и валидацию входных данных.
2. **Service Layer (Бизнес-логика)** — оркестрирует процессы обработки данных, не зная деталей работы с базой данных или сетью.
3. **Repository Layer** — абстрактные интерфейсы и их конкретные реализации для доступа к базе данных.
4. **External Client Layer** — изолированная логика работы со сторонним API Scopus.

### Файловая структура

```
scopus_search_code/
├── app/                             # Исходный код приложения
│   ├── core/                        # Ядро: безопасность, инъекция зависимостей
│   │   ├── dependencies.py          # Фабрики сессий БД и общие Depends
│   │   └── security.py              # Настройки JWT, хэширование, oauth2_scheme
│   ├── infrastructure/              # Реализация работы с внешними системами (БД, API)
│   │   ├── database.py              # Настройка SQLAlchemy engine и async_session
│   │   ├── postgres_article_repo.py # SQL-запросы для статей
│   │   ├── postgres_user_repo.py    # SQL-запросы для пользователей
│   │   └── scopus_client.py         # HTTP-клиент для Scopus (httpx)
│   ├── models/                      # ORM-модели (схема базы данных)
│   │   ├── article.py               # Модель Article (SQLAlchemy)
│   │   └── user.py                  # Модель User (SQLAlchemy)
│   ├── routers/                     # HTTP-эндпоинты (контроллеры)
│   │   ├── articles.py              # Маршруты GET /articles, GET /articles/find
│   │   └── users.py                 # Маршруты POST /register, /login, GET /me
│   ├── schemas/                     # Pydantic-модели (валидация ввода/вывода)
│   │   ├── article_schemas.py       # Схемы для статей (Response, Paginated)
│   │   └── user_schemas.py          # Схемы для юзеров (Register, Login, Token)
│   ├── services/                    # Бизнес-логика (не зависит от веба и БД)
│   │   ├── interfaces/              # Абстрактные классы (для Dependency Inversion)
│   │   │   ├── article_repository.py# IArticleRepository
│   │   │   ├── search_client.py     # ISearchClient
│   │   │   └── user_repository.py   # IUserRepository
│   │   ├── article_service.py       # Логика работы со статьями (пагинация)
│   │   ├── search_service.py        # Оркестрация поиска (Scopus -> БД)
│   │   └── user_service.py          # Логика юзеров (регистрация, проверка паролей)
│   ├── config.py                    # Глобальные настройки (pydantic-settings)
│   └── main.py                      # Точка входа, сборка FastAPI-приложения
├── tests/                           # Каталог для автоматизированных тестов
│   ├── integration/                 # Интеграционные тесты (БД + HTTP)
│   │   ├── __init__.py              # Пакет интеграционных тестов
│   │   ├── test_articles_api.py     # Тесты эндпоинтов статей
│   │   └── test_users_api.py        # Тесты эндпоинтов пользователей
│   ├── unit/                        # Модульные тесты (Изолированная бизнес-логика)
│   │   ├── __init__.py              # Пакет юнит-тестов
│   │   ├── test_article_service.py  # Тестирование ArticleService с моками
│   │   └── test_user_service.py     # Тестирование UserService с моками
│   ├── __init__.py                  # Инициализация тестового пакета
│   └── conftest.py                  # Общие фикстуры (TestClient, Mock БД)
├── alembic/                         # Миграции базы данных (настроено Alembic)
│   ├── versions/                    # Файлы ревизий миграций
│   ├── env.py                       # Среда выполнения Alembic (связь с metadata)
│   └── script.py.mako               # Шаблон для новых миграций
├── .env                             # Локальные переменные окружения (игнорируется Git)
├── .env.example                     # Шаблон переменных окружения
├── .gitignore                       # Исключения для Git
├── alembic.ini                      # Конфигурация Alembic
├── docker-compose.yml               # Оркестрация Docker (App + DB)
├── Dockerfile                       # Сборка образа приложения
├── export_skeleton.py               # Утилита для экспорта "маски" проекта (AST)
├── pytest.ini                       # Настройки запуска pytest
├── README.md                        # Документация (на английском)
└── requirements.txt                 # Зависимости Python
```

---

## Запуск через Docker Compose (рекомендуется)

Это рекомендуемый способ запуска, гарантирующий идентичность окружения.
Требуется установленный [Docker](https://docs.docker.com/get-docker/).

**Шаг 1. Настройка окружения**

Создайте файл `.env` в корне проекта (можно скопировать из `.env.example`) и заполните его:

```
SCOPUS_API_KEY=ваш_ключ_от_scopus

DB_HOST=db
DB_PORT=5432
DB_USER=scopus_db_user
DB_PASSWORD=securepassword
DB_NAME=scopus_db

SECRET_KEY=supersecretkey_change_me_in_production
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
```

Ключ Scopus API можно получить бесплатно для некоммерческого использования на [dev.elsevier.com](https://dev.elsevier.com).

**Шаг 2. Сборка и запуск**

```bash
docker compose up --build
```

Миграции базы данных (Alembic) применяются автоматически при запуске контейнера с приложением.

**Шаг 3. Проверка**

- API: `http://localhost:8000`
- Swagger-документация: `http://localhost:8000/docs`

---

## Локальная разработка (без Docker)

Для запуска проекта напрямую через Python:

1. Убедитесь, что локальный сервер PostgreSQL запущен и база данных создана.
2. В файле `.env` установите `DB_HOST=localhost`.
3. Создайте и активируйте виртуальное окружение:

```bash
python -m venv .venv
.venv\Scripts\activate        # Windows
# source .venv/bin/activate   # macOS / Linux
```

4. Установите зависимости:

```bash
pip install -r requirements.txt
```

5. Примените миграции:

```bash
alembic upgrade head
```

6. Запустите сервер:

```bash
uvicorn app.main:app --reload
```

---

## API Эндпоинты

### Аутентификация

- `POST /users/register` — регистрация нового пользователя
- `POST /users/login` — вход в систему, возвращает JWT-токен
- `GET /users/me` — профиль текущего пользователя (требует токен в заголовке)
- `POST /users/password-reset-request` — запрос сброса пароля

### Статьи

- `GET /articles/find?keyword={kw}` — поиск статей в Scopus по ключевому слову, сохранение в БД, возврат результатов (до 10 записей)
- `GET /articles/?page=1&size=10` — список сохранённых статей из локальной БД с пагинацией (публичный эндпоинт)

---

## Соответствие требованиям ТЗ

- [x] Регистрация и авторизация пользователей (JWT)
- [x] Получение информации о текущем пользователе
- [x] Поиск публикаций через Scopus API (TITLE-ABS-KEY), сохранение первых 10 результатов
- [x] Сохранение полей: publicationName, coverDate, creator, doi — в PostgreSQL
- [x] Публичный эндпоинт `/articles` с пагинацией и полем `total`
- [x] Swagger-документация
- [x] Запуск через Docker Compose
- [x] README с инструкцией по настройке и запуску
- [x] Покрытие тестами: unit- и интеграционные тесты на базе pytest

---

## Тестирование

Проект покрыт автоматизированными тестами с использованием `pytest` и `pytest-asyncio`. Тестовая стратегия следует пирамиде тестирования и разделена на два уровня:

- **Unit-тесты (`tests/unit/`)**: Изолированное тестирование бизнес-логики (`UserService`, `ArticleService`). Внешние зависимости (репозитории, функции хеширования паролей) подменяются с помощью Fake-объектов и моков (`monkeypatch`), что обеспечивает выполнение тестов за доли миллисекунд.
- **Интеграционные тесты (`tests/integration/`)**: Тестирование HTTP-эндпоинтов FastAPI (`/users`, `/articles`). Проверяется полный цикл запроса: валидация Pydantic -> Сервисы -> Репозитории. Для изоляции состояния используется In-memory база данных `SQLite`, которая поднимается и очищается автоматически через фикстуры для каждого теста. Вызовы к внешнему Scopus API замоканы.

**Запуск тестов:**
```bash
# Активируйте виртуальное окружение и выполните:
pytest tests -vv

```
---
## Планируемое развитие проекта

- **Frontend-клиент** — разработка визуального пользовательского интерфейса (React или Vue.js) для удобного поиска и просмотра научных статей.
- **Облачный деплой** — перенос базы данных PostgreSQL с локальной среды на управляемое облачное решение (Managed Cloud Database) и развёртывание приложения на облачном сервере.
