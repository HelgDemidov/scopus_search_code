# Scopus Search API

[![Python Tests](https://github.com/HelgDemidov/scopus_search_code/actions/workflows/tests.yml/badge.svg)](https://github.com/HelgDemidov/scopus_search_code/actions/workflows/tests.yml)

Версия на английском: [README.md](README.md)

Scopus Search API — учебно-практический fullstack-проект для поиска, сохранения, фильтрации и визуализации научных публикаций из базы Scopus. Репозиторий включает FastAPI-бэкенд и React/Vite-фронтенд с публичной лентой статей, приватным профилем пользователя, аналитическим Explore-разделом и live-поиском через Scopus API.

Проект строится вокруг двух сценариев: **накопление собственной локальной базы публикаций** и **онлайн-поиск новых статей через Scopus**. Бэкенд отвечает за аутентификацию, доступ к данным, агрегации и интеграцию со Scopus; фронтенд — за пользовательский интерфейс с поиском, графиками и защищёнными пользовательскими разделами.

---

## Что реализовано

### Backend

- FastAPI-приложение с роутерами `users`, `auth`, `articles`, `health`
- JWT-аутентификация: access token (Bearer) + refresh token в `httpOnly` cookie, ротация токенов
- Регистрация, логин, Google OAuth, профиль пользователя, запрос на сброс пароля
- Публичная выдача сохранённых статей из PostgreSQL с пагинацией и ILIKE-поиском
- Публичная агрегированная статистика по накопленной базе статей
- Приватный live-поиск через Scopus API: `GET /articles/find` (только для авторизованных)
- Недельный лимит live-поиска на пользователя (200 запросов); при превышении — HTTP 429
- Таблица `search_history`: история поисковых запросов пользователя с фильтрами, датой и количеством найденных статей
- Приватные эндпоинты истории поиска и квоты: `GET /articles/history`, `GET /articles/find/quota`
- Асинхронный стек: SQLAlchemy 2.0 + asyncpg + Alembic; repository pattern и DI

### Frontend

- React + TypeScript + Vite SPA; все тексты интерфейса на русском языке
- Маршруты: `/`, `/explore`, `/profile`, `/auth`, `/article/:id`
- **Главная страница:** поведение зависит от статуса авторизации:
  - анонимный пользователь — поиск по локальной тематической коллекции «Artificial Intelligence and Neural Network Technologies»
  - авторизованный пользователь — live-поиск через Scopus API (до 25 статей за запрос)
  - фильтровая боковая панель на главной странице отсутствует
- **Explore (`/explore`):** аналитика в двух режимах — по накопленной коллекции и по личным поискам пользователя; режим переключается кнопками и сохраняется в URL-параметре `?mode=`
- **Профиль (`/profile`):** история поиска с датой, запросом, количеством результатов и фильтровыми метками; фильтрация истории по году, типу документа, Open Access и стране; счётчик недельной квоты Scopus
- **Страница авторизации (`/auth`):** логин, регистрация, Google OAuth
- **Страница статьи (`/article/:id`):** детальная карточка публикации
- Zustand-сторы: `authStore`, `articleStore`, `statsStore`, `historyStore`, `quotaStore`
- Axios-клиент с автоматическим refresh access token

### Инфраструктура

- PostgreSQL 16 (Supabase)
- Railway для деплоя приложения
- GitHub Actions: два CI-job'а — `test` (SQLite) и `test-pg` (PostgreSQL 16 в сервисном контейнере)
- Docker / Docker Compose для локального запуска

---

## Технологический стек

### Backend

- Python 3.12+, FastAPI, SQLAlchemy 2.0 (async), Alembic, PostgreSQL 16 / Supabase
- asyncpg, Pydantic v2, PyJWT, pwdlib / bcrypt / argon2, httpx

### Frontend

- React 19, TypeScript, Vite, React Router, Zustand, Axios
- Recharts, shadcn/ui, Tailwind CSS, Zod, React Hook Form

### DevOps и окружение

- Docker, Docker Compose, Railway, GitHub Actions
- OpenRouter API (генерация поисковых фраз сидера)

---

## Архитектура проекта

Бэкенд построен как многослойное приложение с явным разделением ответственности.

### Слои backend-приложения

1. **Routers** — принимают HTTP-запросы, валидируют входные данные, вызывают сервисы.
2. **Services** — бизнес-логика пользовательских сценариев.
3. **Infrastructure / Repositories** — инкапсулируют доступ к PostgreSQL и внешним сервисам.
4. **Models** — ORM-модели таблиц базы данных.
5. **Schemas** — Pydantic-схемы запросов и ответов.
6. **Core** — безопасность, DI, refresh-token утилиты, конфиг.

### Структура репозитория

```text
scopus_search_code/
├── app/                              # Backend-приложение
│   ├── core/                         # Безопасность, DI, refresh-token утилиты
│   ├── infrastructure/               # Репозитории PostgreSQL и Scopus client
│   ├── interfaces/                   # Абстракции репозиториев и внешних клиентов
│   ├── models/                       # ORM-модели: article, user, refresh_token,
│   │                                 #   seeder_keyword, search_history, base
│   ├── routers/                      # HTTP-эндпоинты: users, auth, articles, health
│   ├── schemas/                      # Pydantic-схемы: article, user, search_history
│   └── services/                     # Бизнес-логика: article, search, search_history, user
├── alembic/                          # Миграции Alembic (PostgreSQL / Supabase)
│   └── versions/                     # Файлы ревизий (0001–0005 + дополнительные)
├── db_seeder/                        # Автоматизированный сидер базы данных
│   └── seeder__scripts/
│       ├── seed_db.py                # Оркестратор: логин, запросы к Scopus, сохранение статей
│       └── keyword_generator.py     # LLM-генератор поисковых фраз (OpenRouter)
├── docs/                             # Документация: техспек фронтенда, маски, деревья проекта
├── frontend/                         # SPA-клиент React + TypeScript + Vite
│   └── src/
│       ├── api/                      # Axios-клиент и функции обращения к API
│       ├── components/               # UI-компоненты (articles, charts, layout, profile, search, ui)
│       ├── hooks/                    # Кастомные React-хуки
│       ├── pages/                    # Страницы: Home, Explore, Profile, Auth, Article
│       ├── stores/                   # Zustand-сторы: auth, articles, stats, history, quota
│       └── types/                    # TypeScript-типы и интерфейсы API
├── tests/
│   ├── integration/                  # Интеграционные тесты (HTTP + БД + внешние клиенты)
│   └── unit/                         # Юнит-тесты (изолированная бизнес-логика)
├── .github/workflows/                # GitHub Actions: tests (SQLite + PG), сидер
├── docker-compose.yml
├── Dockerfile
├── requirements.txt
├── pyproject.toml                    # ruff, mypy, import-linter
├── pytest.ini
├── README.md
└── README.ru.md
```

> Backend располагается в `app/`, frontend — в `frontend/`.

---

## База данных и модели

Актуальные ORM-модели и соответствующие таблицы PostgreSQL:

| Модель | Таблица | Назначение |
|---|---|---|
| `User` | `users` | Пользователи сервиса |
| `Article` | `articles` | Сохранённые публикации |
| `RefreshToken` | `refresh_tokens` | Refresh-токены аутентификации |
| `SeederKeyword` | `seeder_keywords` | История поисковых фраз сидера |
| `SearchHistory` | `search_history` | История live-поисков пользователя |

<details>
<summary>Подробнее о таблице <code>search_history</code></summary>

Колонки: `id`, `user_id` (FK → `users.id` ON DELETE CASCADE), `query`, `created_at`, `result_count`, `filters` (JSONB, `default '{}'`).

Составной индекс: `(user_id, created_at DESC)` — создаётся миграцией `0005_add_search_history.py`.

Запись вставляется только при успешном ответе Scopus API в рамках той же транзакции, что и сохранение статей. При ошибке Scopus запись не создаётся (откат транзакции).

</details>

---

## Backend-эндпоинты

### Users

- `POST /users/register` — регистрация
- `POST /users/login` — логин, возврат access token и установка refresh token cookie
- `GET /users/me` — текущий пользователь
- `POST /users/password-reset-request` — запрос на сброс пароля

### Auth

- `GET /auth/google/login` — начало OAuth-флоу через Google
- `GET /auth/google/callback` — callback после авторизации Google
- `POST /auth/refresh` — обновление access token по refresh token cookie
- `POST /auth/logout` — отзыв refresh token и очистка cookie

### Articles

- `GET /articles/` — публичный список статей с пагинацией; поддерживает `keyword` (фильтр по полю сидера) и `search` (ILIKE по title / author)
- `GET /articles/stats` — агрегированная статистика по накопленной базе (публичный)
- `GET /articles/search/stats` — статистика по конкретному поисковому запросу (приватный)
- `GET /articles/find` — live-поиск в Scopus API, до 25 результатов; сохраняет статьи и запись в `search_history`; проверяет недельную квоту (приватный)
- `GET /articles/history` — история поиска текущего пользователя, до 100 записей (приватный)
- `GET /articles/find/quota` — использование недельной квоты: `limit`, `used`, `remaining`, `reset_at` (приватный)
- `GET /articles/{article_id}` — одна статья по id (публичный)

### Health

- `GET /health` — health-check

<details>
<summary>Детали квоты и конкурентного доступа</summary>

Недельный лимит — 200 live-поисков на пользователя. При превышении эндпоинт возвращает HTTP 429 без обращения к Scopus и без вставки в историю.

Для предотвращения гонок при параллельных запросах от одного пользователя используется `pg_advisory_xact_lock(user_id)` — блокировка берётся до проверки счётчика и снимается вместе с транзакцией. Это гарантирует, что 201-й запрос получит 429 даже при одновременных обращениях.

</details>

---

## Frontend: ключевые сценарии

### Главная страница `/`

Поведение зависит от статуса авторизации. Фильтровая панель на главной странице отсутствует.

**Анонимный пользователь** видит баннер:
> «Поиск без авторизации осуществляется по статьям тематической коллекции «Artificial Intelligence and Neural Network Technologies». Для поиска по глобальной базе Scopus пройдите авторизацию.»

Поиск выполняется через `GET /articles/` по локальной БД.

**Авторизованный пользователь** видит баннер:
> «Выдача результатов поиска по живой базе Scopus ограничена 25 статьями за 1 запрос.»

Поиск выполняется через `GET /articles/find` (Scopus API, live-результаты). При исчерпании квоты отображается toast-уведомление: «Недельный лимит поиска исчерпан».

### Explore `/explore`

Раздел работает в двух режимах, переключаемых кнопками; режим сохраняется в URL-параметре `?mode=`.

| Режим | Данные | Доступ |
|---|---|---|
| По коллекции (умолчание) | `GET /articles/stats` — агрегаты по накопленной базе | для всех |
| По моим поискам | агрегация `historyStore` на клиенте по истории пользователя | только авторизованным |

KPI в режиме «По моим поискам»: число запросов, суммарно найдено статей, число стран и типов документов. Переключатель режимов виден только авторизованным; анонимный пользователь всегда видит режим «По коллекции».

### Профиль `/profile`

При монтировании страницы загружаются история поиска (`GET /articles/history`) и квота (`GET /articles/find/quota`).

**`LiveSearchQuotaCounter`** — отображает `limit`, `used`, `remaining` и дату сброса `reset_at` в виде четырёх ячеек.

**`SearchHistoryList`** — список записей с запросом, датой, числом результатов и фильтровыми бейджами. Поддерживает клиентскую фильтрацию по году, типу документа, Open Access и стране аффилиации. Ссылка «Перейти в аналитику по моим поискам» ведёт на `/explore?mode=personal`.

<details>
<summary>Архитектура клиентских фильтров (historyStore / articleStore)</summary>

Серверные фильтры (`keyword`, `search`) хранятся в `articleStore`. Клиентские фильтры (`yearFrom`, `yearTo`, `docTypes`, `openAccessOnly`, `countries`) — в `historyStore` как `HistoryFilters`. `articleStore.fetchArticles()` применяет клиентские фильтры к загруженной странице через `applyClientFilters()`, получая их из `historyStore.getState()`.

После успешного live-поиска `articleStore.searchScopusLive()` обновляет `quotaStore` через `fetchQuota()` (fire-and-forget, не блокирует завершение поиска).

</details>

---

## Аутентификация и безопасность

- **Access token** — Bearer JWT, короткоживущий.
- **Refresh token** — хранится в `httpOnly` cookie, поддерживается ротация.
- Приватные эндпоинты (`/articles/find`, `/articles/history`, `/articles/find/quota`, `/articles/search/stats`) защищены зависимостью `get_current_user`.

---

## Автоматизированный сидер

Сидер регулярно пополняет локальную базу публикаций через GitHub Actions, работая от имени служебного пользователя.

**Как работает:**
1. Логин в приложение, получение JWT.
2. Чтение уже использованных фраз из `seeder_keywords`.
3. Генерация новых поисковых фраз через OpenRouter API (LLM).
4. Последовательная отправка запросов к `GET /articles/find`.
5. Сохранение статей и фиксация использованных фраз в `seeder_keywords`.

Это позволяет проекту накапливать базу публикаций автоматически, не расходуя пользовательскую недельную квоту.

---

## Облачная база данных Supabase

Проект подключается к PostgreSQL через переменную `DATABASE_URL`. Используются два режима подключения:

- **Session Pooler** — для FastAPI-приложения (SQLAlchemy + asyncpg).
- **Transaction Pooler** — для сидера (короткоживущие соединения).

Тесты не используют Supabase: unit-тесты работают на SQLite in-memory, интеграционные PostgreSQL-тесты (помечены `@pytest.mark.requires_pg`) — на сервисном контейнере PostgreSQL 16 в GitHub Actions.

---

## Тестирование

Проект покрыт unit- и integration-тестами на `pytest` + `pytest-asyncio`.

<details>
<summary>Что тестируется</summary>

- Сервисная логика: пользователи, поиск, история поиска (`SearchHistoryService`).
- Роуты `/users` и `/articles` (включая `find`, `history`, `find/quota`).
- Repository: `FakeSearchHistoryRepository` (9 unit-тестов), `PostgresSearchHistoryRepository` (9 integration-тестов, `requires_pg`).
- Конкурентный доступ и `pg_advisory_xact_lock` (3 PG-теста: «ровно один слот», изоляция блокировок разных пользователей).
- Сценарии с аутентификацией; работа без обращения к реальной Supabase БД.

</details>

### Запуск тестов

```bash
# Только SQLite-тесты (без PostgreSQL)
pytest tests -vv -m "not requires_pg"

# Все тесты (требуется PostgreSQL)
pytest tests -vv
```

---

## Настройка окружения

Создайте `.env` на основе `.env.example`:

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

# Только для сидера
SEEDER_EMAIL=user@example.com
SEEDER_PASSWORD=YOUR_SEEDER_PASSWORD
OPENROUTER_API_KEY=YOUR_OPENROUTER_API_KEY
```

> Перед публикацией проверьте README и `.env.example` на реальные домены, email-адреса, токены и любые секретоподобные строки — замените на нейтральные placeholders.

---

## Локальный запуск

### Backend через Docker Compose

```bash
docker compose up --build
```

API: `http://localhost:8000` · Swagger UI: `http://localhost:8000/docs`

### Backend без Docker

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
# настройте .env
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

## Соответствие исходному ТЗ

<details>
<summary>Исходное ТЗ и его статус</summary>

Исходное ТЗ требовало: регистрацию и авторизацию, получение текущего пользователя, интеграцию со Scopus API, сохранение публикаций в PostgreSQL, публичный список статей с пагинацией, Swagger-документацию, запуск через Docker Compose и README. Всё закрыто.

**Сверх исходного ТЗ реализовано:**
- Frontend-приложение на React/Vite с полным UI на русском языке
- Приватный live-поиск Scopus с недельным лимитом и историей запросов
- Explore-раздел с аналитическими графиками (два режима: коллекция / личные поиски)
- Профиль пользователя: история поиска, фильтрация, счётчик квоты
- Refresh token flow через `httpOnly` cookie, ротация токенов
- Google OAuth
- Автоматизированный сидер базы статей через GitHub Actions
- CI с двумя тест-окружениями: SQLite и PostgreSQL 16

</details>
