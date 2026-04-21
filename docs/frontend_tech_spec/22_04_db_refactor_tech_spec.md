# ТЗ: Рефакторинг хранения данных и обработки поисковых запросов

## 1. Текущее состояние: полный инвентарь дефектов

Прежде чем описывать целевое состояние, фиксируем все найденные проблемы с точным указанием файлов.

### Дефект D-1: `ScopusHTTPClient` помечает user-статьи как `is_seeded=True`
**Файл:** `app/infrastructure/scopus_client.py`, строка `is_seeded=True` в конструкторе `Article` . Клиент вызывается как сидером, так и `SearchService.find_and_save()`. Флаг всегда `True` — разделения нет.

### Дефект D-2: Публичный `GET /articles/` не фильтрует по `is_seeded`
**Файл:** `app/infrastructure/postgres_article_repo.py`, метод `get_all()` . Запрос выбирает все записи из `articles`. Анонимам видны результаты поиска авторизованных пользователей.

### Дефект D-3: Upsert перезаписывает `keyword` и `is_seeded` при конфликте по DOI
**Файл:** `app/infrastructure/postgres_article_repo.py`, метод `save_many()`, блок `set_={}` . Если статья уже есть в коллекции (`is_seeded=True`, `keyword="neural network"`), а пользователь ищет "deep learning" — upsert перепишет оба поля.

### Дефект D-4: Нет связи `search_history → articles`
**Файл:** `app/models/search_history.py` . Таблица хранит `query + result_count`, но не ссылки на конкретные статьи. Нельзя вернуть пользователю результаты прошлого поиска — только список запросов.

### Дефект D-5: `ArticleResponse` возвращает `keyword` клиенту
**Файл:** `app/schemas/article_schemas.py` . Поле `keyword: str` в `ArticleResponse` — это артефакт сидера (технический ярлык), который не несёт ценности для пользователя и не должен быть в публичном API.

### Дефект D-6: `get_search_stats()` агрегирует по всей таблице без изоляции
**Файл:** `app/infrastructure/postgres_article_repo.py`, метод `get_search_stats()` . CTE-запрос ищет по `articles` без фильтрации по `user_id` — агрегаты смешивают данные всех пользователей.

***

## 2. Целевая схема БД

### ERD — нормализованная модель

```
users
 └─< search_history (user_id FK, CASCADE DELETE)
       └─< search_result_articles (search_history_id FK, CASCADE DELETE)
             >─ articles (article_id FK, RESTRICT)

articles
 └─< catalog_articles (article_id FK, CASCADE DELETE)
```

### Таблица `articles` — нормализованный реестр Scopus

Убираем `keyword` и `is_seeded`. Статья — это просто статья Scopus.

```sql
articles (
    id               SERIAL PRIMARY KEY,
    title            VARCHAR(500) NOT NULL,
    journal          VARCHAR(500),
    author           VARCHAR(255),
    publication_date DATE NOT NULL,
    doi              VARCHAR(255),          -- partial UNIQUE INDEX где NOT NULL
    cited_by_count   INTEGER,
    document_type    VARCHAR(100),
    open_access      BOOLEAN,
    affiliation_country VARCHAR(100),
    created_at       TIMESTAMPTZ DEFAULT now() NOT NULL
)
-- Существующий индекс ix_articles_doi_unique остается без изменений
```

### Таблица `catalog_articles` — коллекция сидера (НОВАЯ)

Принадлежность статьи коллекции ИИ теперь — отдельная сущность, а не флаг.

```sql
catalog_articles (
    id          SERIAL PRIMARY KEY,
    article_id  INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
    keyword     VARCHAR(100) NOT NULL,   -- ключевое слово сидера
    seeded_at   TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE (article_id)                 -- статья входит в коллекцию один раз
)
-- INDEX: ix_catalog_articles_keyword (keyword) для фильтрации по теме коллекции
-- INDEX: ix_catalog_articles_article_id (article_id) для JOIN
```

### Таблица `search_history` — история запросов (ИЗМЕНЯЕТСЯ)

Структура остаётся, FK и CASCADE сохраняются.

```sql
search_history (
    id           SERIAL PRIMARY KEY,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    query        TEXT NOT NULL,
    created_at   TIMESTAMPTZ DEFAULT now() NOT NULL,
    result_count INTEGER NOT NULL,
    filters      JSONB NOT NULL DEFAULT '{}'
    -- Существующий индекс ix_search_history_user_created остается
)
```

### Таблица `search_result_articles` — связь история↔статья (НОВАЯ)

```sql
search_result_articles (
    id                SERIAL PRIMARY KEY,
    search_history_id INTEGER NOT NULL REFERENCES search_history(id) ON DELETE CASCADE,
    article_id        INTEGER NOT NULL REFERENCES articles(id) ON DELETE RESTRICT,
    rank              SMALLINT NOT NULL,  -- позиция в выдаче Scopus (0-based)
    UNIQUE (search_history_id, article_id)
)
-- INDEX: ix_sra_search_history_id (search_history_id) — главный путь чтения
-- INDEX: ix_sra_article_id (article_id) — для обратных lookups
```

***

## 3. Новые интерфейсы (контракты)

### `ICatalogRepository` (новый)

```python
class ICatalogRepository(ABC):
    async def get_all(limit, offset, keyword=None, search=None) -> list[Article]
    async def get_total_count(keyword=None, search=None) -> int
    async def save_seeded(articles: list[Article], keyword: str) -> list[Article]
    async def get_stats() -> dict
    async def is_article_in_catalog(article_id: int) -> bool
```

### `ISearchResultRepository` (новый)

```python
class ISearchResultRepository(ABC):
    async def save_results(
        search_history_id: int,
        articles: list[Article],  # уже с id из БД
    ) -> None

    async def get_results_by_history_id(
        search_history_id: int,
        user_id: int,  # для авторизационной проверки владения
    ) -> list[Article]

    async def get_search_stats_for_user(
        user_id: int,
        search: str,
    ) -> dict
```

### `IArticleRepository` (изменяется)

Удаляются методы, которые уходят в `ICatalogRepository`:
- `get_all()` → в `ICatalogRepository`
- `get_total_count()` → в `ICatalogRepository`
- `get_stats()` → в `ICatalogRepository`
- `get_search_stats()` → в `ISearchResultRepository`

Остаётся в `IArticleRepository`:
```python
class IArticleRepository(ABC):
    async def upsert_many(articles: list[Article]) -> list[Article]
    # Чистый upsert без is_seeded/keyword — только нормализованные поля статьи
    async def get_by_id(article_id: int) -> Article | None
```

### `ISearchHistoryRepository` (изменяется)

Метод `insert_row` расширяется — теперь возвращает `SearchHistory` с заполненным `id` (уже реализовано через `flush`). Без других изменений контракта.

***

## 4. Новые сервисы

### `SearchService.find_and_save()` — новая оркестрация

Текущий поток :
```
Scopus → save_many(articles) → insert_row(history)
```

Новый поток:
```
Scopus
  → upsert_many(articles)          # нормализованный реестр
  → insert_row(history)            # запись истории, получаем search_history.id
  → save_results(history_id, articles)  # привязка статей к этой конкретной истории
  → return articles
```

Все три операции выполняются в одной транзакции. Если любая падает — ничего не сохраняется.

### `CatalogService` (новый, выделить из `ArticleService`)

Инкапсулирует всю логику публичной коллекции:
- `get_paginated()` — публичный листинг через `ICatalogRepository`
- `get_stats()` — публичная статистика только по коллекции
- `search_in_catalog()` — полнотекстовый поиск по `catalog_articles JOIN articles`

### `ArticleService` (сокращается)

После рефакторинга `ArticleService` содержит только:
- `get_by_id()` — публичный доступ к одной статье по id

***

## 5. Изменения роутеров

| Эндпоинт | Тип | Что меняется |
|---|---|---|
| `GET /articles/` | Публичный | Читает через `CatalogService` → только `catalog_articles JOIN articles` |
| `GET /articles/stats` | Публичный | Читает через `CatalogService` → агрегаты только по коллекции |
| `GET /articles/find` | Приватный | Возвращает результаты **из `search_result_articles`** текущего пользователя |
| `GET /articles/search/stats` | Приватный | Агрегаты из `search_result_articles` только по `user_id` текущего пользователя |
| `GET /articles/history` | Приватный | Без изменений — возвращает записи `search_history` пользователя |
| `GET /articles/find/quota` | Приватный | Без изменений |
| `GET /articles/{id}` | Публичный | Без изменений |
| **NEW** `GET /articles/history/{id}/results` | Приватный | Результаты конкретного прошлого поиска через `search_result_articles` |

***

## 6. Изменения схем Pydantic

### `ArticleResponse` — удалить `keyword`

`keyword` — технический атрибут сидера, клиенту не нужен .

### `SearchHistoryItemResponse` — добавить поле `results_available: bool`

Чтобы фронтенд знал, можно ли запросить результаты прошлого поиска.

### Новая схема `SearchResultsResponse`

```python
class SearchResultsResponse(BaseModel):
    search_history_id: int
    query: str
    created_at: datetime
    articles: list[ArticleResponse]
```

***

## 7. Alembic миграция `0006_refactor_article_ownership`

### Фаза 1 — Создать новые таблицы (не разрушающая)

```sql
CREATE TABLE catalog_articles (
    id         SERIAL PRIMARY KEY,
    article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
    keyword    VARCHAR(100) NOT NULL,
    seeded_at  TIMESTAMPTZ DEFAULT now() NOT NULL,
    CONSTRAINT uq_catalog_articles_article_id UNIQUE (article_id)
);
CREATE INDEX ix_catalog_articles_article_id ON catalog_articles(article_id);
CREATE INDEX ix_catalog_articles_keyword    ON catalog_articles(keyword);

CREATE TABLE search_result_articles (
    id                SERIAL PRIMARY KEY,
    search_history_id INTEGER NOT NULL REFERENCES search_history(id) ON DELETE CASCADE,
    article_id        INTEGER NOT NULL REFERENCES articles(id) ON DELETE RESTRICT,
    rank              SMALLINT NOT NULL,
    CONSTRAINT uq_sra_history_article UNIQUE (search_history_id, article_id)
);
CREATE INDEX ix_sra_search_history_id ON search_result_articles(search_history_id);
CREATE INDEX ix_sra_article_id        ON search_result_articles(article_id);
```

### Фаза 2 — Перенести данные коллекции

```sql
-- Переносим все текущие is_seeded=True статьи в catalog_articles
INSERT INTO catalog_articles (article_id, keyword, seeded_at)
SELECT id, keyword, created_at
FROM   articles
WHERE  is_seeded = TRUE
ON CONFLICT DO NOTHING;

-- Удаляем is_seeded=False статьи (user-статьи без владельца — orphans)
-- Их нельзя восстановить, так как связь search_history → articles не существовала
DELETE FROM articles WHERE is_seeded = FALSE;
```

### Фаза 3 — Удалить устаревшие колонки

```sql
ALTER TABLE articles DROP COLUMN is_seeded;
ALTER TABLE articles DROP COLUMN keyword;
```

### `downgrade()`

Восстанавливает колонки, переносит данные обратно из `catalog_articles`, удаляет новые таблицы.

***

## 8. Изменения в `ScopusHTTPClient`

Убрать `is_seeded=True` из конструктора `Article` . После рефакторинга клиент создаёт объекты `Article` без полей `keyword` и `is_seeded` — они больше не принадлежат модели. Принадлежность определяется вызывающим кодом через соответствующий репозиторий.

***

## 9. Затронутые файлы — сводная таблица

| Файл | Тип изменения |
|---|---|
| `app/models/article.py` | Удалить `keyword`, `is_seeded` |
| `app/models/catalog_article.py` | **Создать** |
| `app/models/search_result_article.py` | **Создать** |
| `app/interfaces/article_repository.py` | Удалить `get_all`, `get_total_count`, `get_stats`, `get_search_stats`; переименовать `save_many` → `upsert_many` |
| `app/interfaces/catalog_repository.py` | **Создать** |
| `app/interfaces/search_result_repo.py` | **Создать** |
| `app/infrastructure/postgres_article_repo.py` | Удалить устаревшие методы; `upsert_many` без `keyword`/`is_seeded` |
| `app/infrastructure/postgres_catalog_repo.py` | **Создать** |
| `app/infrastructure/postgres_search_result_repo.py` | **Создать** |
| `app/services/article_service.py` | Сократить до `get_by_id` |
| `app/services/catalog_service.py` | **Создать** из частей `ArticleService` |
| `app/services/search_service.py` | Расширить `find_and_save` — добавить вызов `save_results` |
| `app/infrastructure/scopus_client.py` | Убрать `is_seeded=True` из `Article()` |
| `app/routers/articles.py` | Заменить зависимости; добавить `GET /history/{id}/results` |
| `app/schemas/article_schemas.py` | Удалить `keyword` из `ArticleResponse`; добавить `SearchResultsResponse` |
| `alembic/versions/0006_...py` | **Создать** |
| Тесты — все файлы с `save_many`, `is_seeded`, `ArticleService` | Обновить |

***

## 10. Порядок реализации

1. **Миграция** — создать таблицы и перенести данные (без удаления колонок до готовности кода)
2. **Модели** — `CatalogArticle`, `SearchResultArticle`, обновить `Article`
3. **Интерфейсы** — все три контракта
4. **Инфраструктура** — три репозитория
5. **Сервисы** — `CatalogService`, обновить `SearchService`
6. **Роутер** — переключить зависимости, добавить эндпоинт
7. **Схемы** — обновить `ArticleResponse`, добавить `SearchResultsResponse`
8. **Финальная фаза миграции** — удалить колонки `keyword`, `is_seeded`
9. **Тесты** — обновить fixtures и unit-тесты

Готов начинать с любого пункта. Рекомендую начать с **шага 1 (миграция)** — она применяется к живой БД, и все остальные шаги должны быть согласованы с её результатом. Начинаем?