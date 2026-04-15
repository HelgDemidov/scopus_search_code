# Scopus Search API

[![Python Tests](https://github.com/HelgDemidov/scopus_search_code/actions/workflows/tests.yml/badge.svg)](https://github.com/HelgDemidov/scopus_search_code/actions/workflows/tests.yml)

Версия на английском: [README.md](README.md)

Мой учебный REST API сервис для поиска научных публикаций в базе Scopus, их сохранения и отображения.
Проект реализован на Python с использованием фреймворка FastAPI и базы данных PostgreSQL.

Архитектура проекта построена с упором на принципы **SOLID**: строгое разделение на слои, паттерн Repository, Dependency Injection.

---

## Техническое задание

В рамках проекта разработан API для веб-приложения со следующим функционалом:

- **Аутентификация:** регистрация и авторизация пользователей (поля: имя и email), получение информации о текущем авторизованном пользователе.
- **Интеграция со Scopus API:** приватный эндпоинт `/articles/find` для поиска статей по ключевым словам. Сервис обращается к Scopus API, получает до 25 первых публикаций и сохраняет поля `title`, `journal`, `author`, `publication_date`, `doi`, `cited_by_count`, `document_type`, `open_access`, `affiliation_country` в базу данных.
- **Вывод данных:** публичный эндпоинт `/articles` для вывода сохраненных результатов в формате JSON с поддержкой пагинации и счетчиком общего числа записей.
- **Инфраструктура:** PostgreSQL в качестве хранилища, Swagger-документация, запуск через Docker Compose, наличие README.

---

## Технологический стек

- **Язык:** Python 3.12+
- **Фреймворк:** FastAPI
- **База данных:** PostgreSQL 16 (облачный хостинг — Supabase)
- **ORM и миграции:** SQLAlchemy 2.0 (async), Alembic
- **Аутентификация:** JWT (PyJWT), bcrypt/argon2 (pwdlib)
- **HTTP-клиент:** httpx (асинхронный)
- **Деплой:** Railway (автодеплой из ветки `main` через Dockerfile)
- **CI/CD:** GitHub Actions (тесты, линтеры, coverage, автоматический сидер)
- **Сидер:** OpenRouter API (google/gemini-2.0-flash) — генерация поисковых фраз
- **Инфраструктура:** Docker, Docker Compose

---

## Облачная база данных (Supabase)

Изначально проект использовал локальный экземпляр PostgreSQL (через Docker Compose).
На текущем этапе база данных перенесена в управляемый облачный сервис Supabase
(PostgreSQL), при этом архитектура приложения и тестов осталась неизменной.

Ключевые моменты:

- Приложение подключается к базе данных по **единой строке подключения** `DATABASE_URL`.
- Используется полностью асинхронный стек: SQLAlchemy async + драйвер `asyncpg`.
- **Тип пулера зависит от компонента:**
  - FastAPI-сервис (Railway) использует **Session Pooler** (порт 5432) — совместим с долгоживущими соединениями SQLAlchemy.
  - Сидер (`seed_db.py`, короткоживущие соединения asyncpg) использует **Transaction Pooler** (порт 6543) с параметром `statement_cache_size=0` для совместимости с PgBouncer.
- Юнит‑ и интеграционные тесты по‑прежнему используют **in‑memory SQLite** через `tests/conftest.py` и никак не затрагивают облачную БД.

---

## Автоматизированный сидер базы данных

Для автономного наполнения базы данных академическими статьями реализован полностью автоматизированный сидер, работающий по расписанию через GitHub Actions.

**Принцип работы (один запуск):**
1. Автологин через `POST /users/login` на Railway-сервисе — получение JWT-токена.
2. Загрузка истории использованных фраз из таблицы `seeder_keywords` (Supabase).
3. Генерация **120 уникальных академических поисковых фраз** через OpenRouter API (модель `google/gemini-2.0-flash`). Используется детерминированная ротация из 5 тематических кластеров по дням: *Large Language Models, Generative Adversarial Networks, Neuromorphic Computing, AI Hardware Accelerators, AutoML and Self-Improving Systems*.
4. Последовательные запросы к `GET /articles/find` по **100 фразам** с паузой 2 сек — до 25 статей за запрос.
5. Автоматический refresh JWT при истечении токена (401); остановка при остатке квоты Scopus < 500 запросов.
6. Фиксация каждой использованной фразы в `seeder_keywords` (с количеством найденных статей).

**Скрипты:** [`db_seeder/seeder__scripts/seed_db.py`](db_seeder/seeder__scripts/seed_db.py) и [`keyword_generator.py`](db_seeder/seeder__scripts/keyword_generator.py).

**Расписание:** ежедневно в **03:00 UTC** (`cron: "0 3 * * *"`), плюс ручной запуск через `workflow_dispatch`. Секреты (`DATABASE_URL`, `SEEDER_EMAIL`, `SEEDER_PASSWORD`, `OPENROUTER_API_KEY`) передаются через GitHub Secrets.

**Метрики наполнения:** до 2 500 новых статей за запуск, до ~17 500 в неделю. Стоимость LLM-генерации фраз — ~$0.001 за запуск.

---

## Архитектура и структура проекта

Проект разделен на четыре логических слоя:

1. **HTTP Layer (Routers)** — принимает HTTP-запросы, отвечает только за маршрутизацию и валидацию входных данных.
2. **Service Layer (Бизнес-логика)** — оркестрирует процессы обработки данных, не зная деталей работы с базой данных или сетью.
3. **Repository Layer** — абстрактные интерфейсы и их конкретные реализации для доступа к базе данных.
4. **External Client Layer** — изолированная логика работы со сторонним API Scopus.

### Файловая структура

```
scopus_search_code/
├── app/                              # Исходный код приложения
│   ├── core/                         # Ядро: конфиг, безопасность, DI (зависимости)
│   ├── infrastructure/               # Инфраструктура: БД, репозитории, Scopus-клиент
│   ├── interfaces/                   # Абстракции домена: репозитории и внешние клиенты
│   ├── models/                       # ORM-модели (article, user, seeder_keyword, base)
│   ├── routers/                      # HTTP-эндпоинты (контроллеры FastAPI)
│   ├── schemas/                      # Pydantic-схемы (валидация ввода/вывода)
│   └── services/                     # Бизнес-логика поверх интерфейсов
├── db_seeder/                        # Автоматизированный сидер базы данных
│   └── seeder__scripts/
│       ├── seed_db.py                # Оркестратор: логин, запросы к Scopus, сохранение
│       └── keyword_generator.py     # LLM-генератор поисковых фраз (OpenRouter)
├── docs/                             # Документация и артефакты анализа
│   ├── project_mask/                 # Маски кодовой базы для LLM-анализа
│   └── project_tree/                 # Снимки структуры проекта
├── tests/                            # Автоматические тесты
│   ├── integration/                  # Интеграционные тесты (HTTP + БД + внешние клиенты)
│   └── unit/                         # Юнит-тесты (изолированная бизнес-логика)
├── alembic/                          # Миграции базы данных (Alembic, Supabase Postgres)
│   └── versions/                     # Файлы ревизий миграций
├── .github/
│   └── workflows/                    # GitHub Actions: тесты, линтеры, coverage, сидер
├── .coveragerc                       # Конфигурация coverage.py
├── .dockerignore                     # Исключения для Docker-контекста
├── .env                              # Локальные переменные окружения (не коммитить)
├── .env.example                      # Шаблон переменных окружения
├── .gitignore                        # Правила исключения файлов из Git
├── .importlinter                     # Конфигурация import-linter (контроль зависимостей)
├── alembic.ini                       # Настройки Alembic (подключение к БД)
├── docker-compose.yml                # Docker Compose (локальный запуск приложения)
├── Dockerfile                        # Docker-образ FastAPI-приложения
├── pyproject.toml                    # Настройки инструментов (ruff, mypy, import-linter)
├── pytest.ini                        # Конфигурация pytest
├── requirements.txt                  # Зависимости Python
├── README.md                         # Документация проекта (английская версия)
└── README.ru.md                      # Документация проекта (русская версия)
```

---

## Настройка окружения

Перед запуском создайте файл `.env` в корне проекта на основе шаблона `.env.example`.
Ключевые переменные:

```env
SCOPUS_API_KEY=your_scopus_api_key_here

# Единая строка подключения к базе данных.
# Для локального PostgreSQL:
# DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/testdb
# Для Supabase Session Pooler (FastAPI-сервис, порт 5432):
# DATABASE_URL=postgresql+asyncpg://user:password@host.supabase.co:5432/postgres
# Для Supabase Transaction Pooler (сидер, порт 6543):
# DATABASE_URL=postgresql+asyncpg://user:password@host.supabase.co:6543/postgres
DATABASE_URL=...

SECRET_KEY=your_super_secret_key_for_jwt_generation
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30

# Только для сидера (db_seeder/seeder__scripts/):
# SEEDER_EMAIL=email_зарегистрированного_пользователя
# SEEDER_PASSWORD=его_пароль
# OPENROUTER_API_KEY=sk-or-...
```

---

## Локальный запуск с Docker Compose

> **Production-деплой** осуществляется автоматически через Railway при пуше в `main`.
> Docker Compose предназначен для **локальной разработки**.

Docker Compose упаковывает приложение в контейнер. После миграции на Supabase локальный контейнер PostgreSQL не обязателен — сервис `db` может быть закомментирован в `docker-compose.yml`, активен только сервис `app`.

Убедитесь, что в `.env` задан корректный `DATABASE_URL`, затем:

```bash
docker compose up --build
```

Приложение будет доступно по адресу http://localhost:8000.

---

## Локальный запуск без Docker

<details>
<summary>Развернуть инструкцию</summary>

1. Создайте и активируйте виртуальное окружение:
```bash
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS / Linux:
source .venv/bin/activate
```

2. Установите зависимости:
```bash
pip install -r requirements.txt
```

3. Создайте `.env` на основе `.env.example` с корректным `DATABASE_URL`.

4. Примените миграции:
```bash
alembic upgrade head
```

5. Запустите сервер разработки:
```bash
uvicorn app.main:app --reload
```

Swagger UI доступен по адресу http://127.0.0.1:8000/docs.

</details>

---

## API Эндпоинты

### Аутентификация

- `POST /users/register` — регистрация нового пользователя
- `POST /users/login` — вход в систему, возвращает JWT-токен
- `GET /users/me` — профиль текущего пользователя (требует токен в заголовке)
- `POST /users/password-reset-request` — запрос сброса пароля

### Статьи

- `GET /articles/find?keyword={kw}` — поиск статей в Scopus по ключевому слову, сохранение в БД, возврат результатов (до 25 записей)
- `GET /articles/?page=1&size=10` — список сохраненных статей из БД с пагинацией (публичный эндпоинт)
- `GET /articles/stats` — агрегированная статистика по сидированным статьям (публичный эндпоинт)

---

## Соответствие требованиям ТЗ

- [x] Регистрация и авторизация пользователей (JWT)
- [x] Получение информации о текущем пользователе
- [x] Поиск публикаций через Scopus API (TITLE-ABS-KEY), сохранение первых 25 результатов
- [x] Сохранение полей: `title`, `journal`, `author`, `publication_date`, `doi`, `cited_by_count`, `document_type`, `open_access`, `affiliation_country` — в PostgreSQL
- [x] Публичный эндпоинт `/articles` с пагинацией и полем `total`
- [x] Swagger-документация
- [x] Запуск через Docker Compose
- [x] README с инструкцией по настройке и запуску
- [x] Покрытие тестами: unit- и интеграционные тесты на базе pytest, покрытие кода ≥ 80%

---

## Тестирование

Проект покрыт автоматизированными тестами с использованием `pytest` и `pytest-asyncio`. Тестовая стратегия следует пирамиде тестирования и разделена на два уровня:

- **Unit-тесты (`tests/unit/`)**: Изолированное тестирование бизнес-логики (`UserService`, `ArticleService`). Внешние зависимости (репозитории, функции хеширования паролей) подменяются с помощью Fake-объектов и моков (`monkeypatch`), что обеспечивает выполнение тестов за доли миллисекунд.
- **Интеграционные тесты (`tests/integration/`)**: Тестирование HTTP-эндпоинтов FastAPI (`/users`, `/articles`). Проверяется полный цикл запроса: валидация Pydantic → Сервисы → Репозитории. Для изоляции состояния используется In-memory база данных SQLite, которая поднимается и очищается автоматически через фикстуры для каждого теста. Вызовы к внешнему Scopus API замоканы.

> Примечание: тесты в CI (GitHub Actions) не подключаются к Supabase.
> В workflow-файле используется фиктивный `DATABASE_URL`, а реальные тесты переопределяют подключение на in‑memory SQLite через `tests/conftest.py`.
> Это гарантирует, что облачная база данных не будет изменена во время прогонов CI.

**Запуск тестов:**

```bash
pytest tests -vv
```

---

## Планируемое развитие проекта

- **Frontend-клиент** — разработка визуального пользовательского интерфейса для поиска, просмотра статей и аналитического дашборда по накопленным данным. Находится в активной разработке.
