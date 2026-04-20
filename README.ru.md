# Scopus Search API

[![Python Tests](https://github.com/HelgDemidov/scopus_search_code/actions/workflows/tests.yml/badge.svg)](https://github.com/HelgDemidov/scopus_search_code/actions/workflows/tests.yml)

Версия на английском: [README.md](README.md)

Scopus Search API — учебно-практический fullstack-проект для поиска, сохранения, фильтрации и визуализации научных публикаций из базы Scopus. Репозиторий уже содержит не только FastAPI-бэкенд, но и React/Vite-фронтенд с приватным профилем пользователя, публичной лентой статей, аналитическим Explore-разделом и интеграцией с live-поиском через Scopus API.

Проект строится вокруг двух сценариев: **накопление собственной локальной базы публикаций** и **онлайн-поиск новых статей через Scopus**. Бэкенд отвечает за аутентификацию, доступ к данным, агрегации и интеграцию со Scopus, а фронтенд — за удобный пользовательский интерфейс с фильтрами, графиками и защищенными пользовательскими разделами.

---

## Что уже реализовано

### Backend

- FastAPI-приложение с роутерами `users`, `auth`, `articles`, `health`
- JWT-аутентификация с access token и refresh token в `httpOnly` cookie
- Регистрация, логин, профиль текущего пользователя, запрос на сброс пароля
- Публичная выдача сохраненных статей из PostgreSQL с пагинацией
- Публичная агрегированная статистика по накопленной базе статей
- Приватный live-поиск через Scopus API: `GET /articles/find`
- Асинхронный стек: SQLAlchemy 2.0 + asyncpg + Alembic
- Repository pattern, DI и разделение на слои

### Frontend

- React + TypeScript + Vite SPA
- Маршруты `/`, `/explore`, `/profile`, `/auth`, `/article/:id`
- Главная страница со строкой поиска, фильтрами и списком статей
- Explore-страница с KPI-карточками и графиками по накопленной базе
- Страница профиля текущего пользователя
- Страница авторизации: логин, регистрация, Google OAuth
- Zustand stores для auth, articles и stats
- Axios-клиент с автоматическим refresh access token

### Инфраструктура

- PostgreSQL 16 (Supabase)
- Railway для деплоя приложения
- GitHub Actions для тестов и автоматического сидера
- Docker / Docker Compose для локального запуска

---

## Актуальный статус проекта

На текущем этапе проект уже вышел за рамки исходного минимального ТЗ про «REST API для поиска статей». Фактически это **fullstack-система для работы с научными публикациями**, где backend хранит и агрегирует данные, а frontend предоставляет UI для поиска и анализа.

При этом часть нового продуктового функционала еще находится в разработке. В кодовой базе **пока отсутствуют** таблица `search_history`, недельные лимиты пользовательского live-поиска, отдельные эндпоинты истории поиска и полноценное отображение этих данных в профиле пользователя. README ниже описывает как **уже существующую реализацию**, так и **актуальный контекст для ближайшего обновления**.

---

## Техническое задание и его эволюция

Исходное ТЗ требовало реализовать backend-сервис со следующими возможностями:

- регистрация и авторизация пользователей;
- получение текущего пользователя;
- интеграция со Scopus API для поиска публикаций;
- сохранение результатов в PostgreSQL;
- публичный эндпоинт списка статей с пагинацией;
- Swagger-документация;
- запуск через Docker Compose;
- README с инструкцией по запуску.

Это ТЗ закрыто. Дополнительно в проекте уже реализованы фронтенд, аналитические графики, refresh token flow, Google OAuth и автоматизированный сидер для регулярного пополнения базы публикаций.

---

## Технологический стек

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

### DevOps и окружение

- Docker
- Docker Compose
- Railway
- GitHub Actions
- OpenRouter API (для генерации поисковых фраз сидера)

---

## Архитектура проекта

Бэкенд построен как многослойное приложение с явным разделением ответственности между HTTP-слоем, бизнес-логикой, инфраструктурой и моделями данных.

### Слои backend-приложения

1. **Routers** — принимают HTTP-запросы, валидируют входные данные, вызывают сервисы и возвращают ответ.
2. **Services** — содержат бизнес-логику пользовательских сценариев.
3. **Infrastructure / Repositories** — инкапсулируют доступ к PostgreSQL и внешним сервисам.
4. **Models** — ORM-модели таблиц базы данных.
5. **Schemas** — Pydantic-схемы запросов и ответов.
6. **Core** — безопасность, зависимости, refresh-token утилиты, конфиг.

### Актуальная структура репозитория

```text
scopus_search_code/
├── app/
│   ├── core/                         # security, dependencies, refresh token utils
│   ├── infrastructure/               # репозитории PostgreSQL и Scopus client
│   ├── interfaces/                   # абстракции репозиториев и клиентов
│   ├── models/                       # ORM-модели: article, user, refresh_token, seeder_keyword
│   ├── routers/                      # users, auth, articles, health
│   ├── schemas/                      # Pydantic-схемы для users и articles
│   ├── services/                     # бизнес-логика приложения
│   ├── config.py                     # настройки приложения
│   └── main.py                       # точка входа FastAPI
├── alembic/                          # миграции базы данных
├── db_seeder/                        # автоматизированное наполнение БД
├── frontend/                         # SPA-клиент на React/Vite
├── tests/                            # unit и integration tests
├── Dockerfile
├── docker-compose.yml
├── pyproject.toml
├── requirements.txt
├── README.md
└── README.ru.md
```

> Важно: в актуальной ветке backend располагается в каталоге `app/`, а не в `backend/app/`. Frontend располагается в `frontend/`.

---

## База данных и модели

На текущий момент в кодовой базе задействованы следующие ORM-модели:

- `User` — пользователи (`users`)
- `Article` — сохраненные публикации (`articles`)
- `RefreshToken` — refresh-токены (`refresh_tokens`)
- `SeederKeyword` — история поисковых фраз сидера (`seeder_keywords`)

### Что хранится в `users`

Текущая таблица пользователей содержит:

- `id`
- `username`
- `email`
- `hashed_password`
- `created_at`

На момент обновления README таблицы `search_history` в проекте **еще нет**. Это важно для дальнейшего развития профиля пользователя и функционала истории запросов.

---

## Реализованные backend-эндпоинты

### Users

- `POST /users/register` — регистрация нового пользователя
- `POST /users/login` — логин, возврат access token и установка refresh token cookie
- `GET /users/me` — получение текущего пользователя по bearer token
- `POST /users/password-reset-request` — запрос на сброс пароля

### Auth

- `GET /auth/google/login` — начало OAuth-флоу через Google
- `GET /auth/google/callback` — callback после авторизации Google
- `POST /auth/refresh` — обновление access token по refresh token cookie
- `POST /auth/logout` — отзыв refresh token и очистка cookie

### Articles

- `GET /articles/` — публичный список сохраненных статей с пагинацией
- `GET /articles/stats` — общая агрегированная статистика по накопленной базе
- `GET /articles/search/stats` — статистика по конкретному поисковому запросу
- `GET /articles/find` — приватный live-поиск в Scopus API с сохранением результатов
- `GET /articles/{article_id}` — получение статьи по id

### Health

- `GET /health` — health-check приложения

---

## Реализованный frontend

Фронтенд уже является полноценной частью проекта, поэтому его важно описывать в README как основной слой системы, а не как «будущую работу».

### Маршруты приложения

- `/` — главная страница с поиском, фильтрами и списком статей
- `/explore` — аналитический раздел с KPI и графиками
- `/profile` — профиль авторизованного пользователя
- `/auth` — страница логина / регистрации / Google OAuth
- `/article/:id` — детальная страница статьи

### Ключевые компоненты и возможности

- `SearchBar` — строка поиска
- `ArticleFilters` — фильтрация по году, типу документа, open access и стране
- `ArticleList` — список карточек статей с пагинацией
- `SearchResultsDashboard` — мини-дашборд результатов поиска
- `ScopusQuotaBadge` — отображение quota-метаданных, полученных из Scopus API
- `ProfilePage` — профиль текущего пользователя
- `ExplorePage` — визуализация накопленной статистики через графики

### Графики в Explore

В `frontend/src/components/charts/` уже реализованы компоненты визуализации:

- публикации по годам;
- типы документов;
- топ стран;
- топ журналов;
- топ ключевых слов.

---

## Аутентификация и безопасность

В проекте используется комбинированная схема аутентификации:

- **Access token** передается как Bearer JWT;
- **Refresh token** хранится в `httpOnly` cookie;
- поддерживается ротация refresh token;
- доступ к приватным сценариям защищен через dependency `get_current_user`.

Текущая реализация особенно важна для live-поиска по Scopus: endpoint `/articles/find` уже является приватным и требует авторизации. Это означает, что бизнес-ограничение «только авторизованный пользователь может выполнять live-поиск» на backend-уровне уже реализовано.

---

## Облачная база данных Supabase

Проект подключается к PostgreSQL через единую переменную окружения `DATABASE_URL`.

Используются два сценария подключения:

- **Session Pooler** — для FastAPI-приложения с SQLAlchemy;
- **Transaction Pooler** — для короткоживущих соединений сидера.

Тесты при этом не используют Supabase: в тестовом окружении применяется in-memory SQLite, а реальные внешние зависимости мокируются.

---

## Автоматизированный сидер базы данных

В проекте реализован автоматизированный сидер, который регулярно пополняет локальную базу публикаций через GitHub Actions.

### Как работает сидер

1. Выполняет логин в приложение.
2. Получает JWT для доступа к приватному `GET /articles/find`.
3. Читает уже использованные поисковые фразы из `seeder_keywords`.
4. Генерирует новые поисковые фразы через OpenRouter API.
5. Последовательно отправляет запросы к live-поиску Scopus.
6. Сохраняет статьи и фиксирует историю использованных keyword-фраз.

### Практический смысл

Это позволяет проекту работать в двух режимах:

- как поисковый интерфейс по уже накопленной локальной базе статей;
- как клиент для актуального онлайн-поиска новых публикаций через Scopus.

---

## Настройка окружения

Перед запуском создайте `.env` на основе `.env.example`.

Пример безопасного шаблона:

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

# Только для сидера
SEEDER_EMAIL=user@example.com
SEEDER_PASSWORD=YOUR_SEEDER_PASSWORD
OPENROUTER_API_KEY=YOUR_OPENROUTER_API_KEY
```

> Перед публикацией документации обязательно проверьте README и `.env.example` на реальные домены, e-mail адреса, токены, логины и любые длинные секретоподобные строки. Все такие значения должны быть заменены на нейтральные placeholders.

---

## Локальный запуск backend

### Через Docker Compose

```bash
docker compose up --build
```

После запуска API будет доступен по адресу `http://localhost:8000`, а Swagger UI — по адресу `http://localhost:8000/docs`.

### Без Docker

1. Создайте виртуальное окружение:

```bash
python -m venv .venv
source .venv/bin/activate
```

2. Установите зависимости:

```bash
pip install -r requirements.txt
```

3. Настройте `.env`

4. Примените миграции:

```bash
alembic upgrade head
```

5. Запустите backend:

```bash
uvicorn app.main:app --reload
```

---

## Локальный запуск frontend

Если фронтенд запускается отдельно от backend, используйте стандартный Vite-flow из каталога `frontend/`:

```bash
cd frontend
npm install
npm run dev
```

Обычно frontend будет доступен по адресу `http://localhost:5173`.

---

## Тестирование

Проект покрыт unit- и integration-тестами на `pytest` и `pytest-asyncio`.

### Что тестируется

- сервисная логика пользователей;
- роуты `/users` и `/articles`;
- взаимодействие Pydantic → Service → Repository;
- сценарии с аутентификацией;
- работа приложения без обращения к реальной Supabase БД.

### Запуск тестов

```bash
pytest tests -vv
```

---

## Актуальный контекст для следующего обновления README

Ниже — сводка по важным областям, которые уже учтены при анализе кодовой базы и должны быть отражены в будущих продуктовых изменениях.

| Область | Что есть сейчас | Что еще предстоит реализовать |
|---|---|---|
| Профиль пользователя | `GET /users/me`, `ProfilePage`, logout | история поиска, лимиты, richer dashboard |
| Live-поиск Scopus | приватный `GET /articles/find` | недельные пользовательские квоты |
| Фильтрация статей | год, тип документа, OA, страна | возможное расширение набора фильтров |
| Explore-аналитика | KPI + графики по накопленной базе | переключение режимов / пользовательская аналитика |
| История поиска | заглушка в UI | таблица `search_history`, миграция, API, интеграция во frontend |
| Quota UX | `ScopusQuotaBadge` для ответа Scopus API | отдельный пользовательский счетчик лимита |

---

## Что еще не реализовано

Чтобы README не вводил в заблуждение, важно явно зафиксировать текущие пробелы:

- нет ORM-модели и таблицы `search_history`;
- нет отдельного backend-эндпоинта истории поиска пользователя;
- нет недельного лимита поисковых запросов на пользователя;
- нет отдельного endpoint для quota-показателя пользователя;
- в профиле пользователя история поиска пока представлена как UI-заглушка;
- часть текстов интерфейса еще не унифицирована по языку.

---

## Соответствие исходному ТЗ

### Уже выполнено

- [x] Регистрация и авторизация пользователей
- [x] Получение текущего пользователя
- [x] Интеграция со Scopus API
- [x] Сохранение публикаций в PostgreSQL
- [x] Публичная выдача сохраненных статей с пагинацией
- [x] Swagger-документация
- [x] Запуск через Docker Compose
- [x] README с инструкцией по настройке и запуску
- [x] Покрытие тестами

### Сверх исходного ТЗ

- [x] Frontend-приложение на React/Vite
- [x] Explore-раздел с аналитическими графиками
- [x] Refresh token flow через `httpOnly` cookie
- [x] Google OAuth
- [x] Автоматизированный сидер базы статей через GitHub Actions

---

## Направления дальнейшего развития

Наиболее логичное следующее развитие проекта:

1. добавить таблицу `search_history` и миграцию Alembic;
2. реализовать backend-эндпоинты истории поиска и quota;
3. подключить историю поиска и лимиты в `ProfilePage`;
4. завершить русификацию интерфейса;
5. расширить аналитику Explore новыми режимами просмотра;
6. обновить README.md и README.ru.md синхронно после продуктовых изменений.
