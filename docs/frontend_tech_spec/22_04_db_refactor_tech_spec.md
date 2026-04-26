# ТЗ: Рефакторинг хранения данных и обработки поисковых запросов

> **Версия 2.1** — включает исправления по результатам adversarial-анализа (A-1…A-4, B-1…B-3, C-1…C-3, D-1…D-3) и упрощения по результатам simplicity-анализа (S-1…S-4).

---

## 0. Целевые user-stories (критерии приёмки)

Реализация считается завершённой, когда выполнены все четыре условия:

1. **Анонимный пользователь** видит ТОЛЬКО статьи из тематической коллекции, формируемой сидером.
2. **Авторизованный пользователь** видит результаты исключительно своего поиска — в поисковой строке, в разделе «История поиска» и в разделе «Аналитика по моим поискам» (`/explore?mode=personal`).
3. **Истории поиска** различных авторизованных пользователей хранятся отдельно и никогда не пересекаются.
4. **У анонимного пользователя** никакой истории поиска не может быть в принципе.

---

## 1. Текущее состояние: полный инвентарь дефектов

Прежде чем описывать целевое состояние, фиксируем все найденные проблемы с точным указанием файлов.

### Дефект D-1: `ScopusHTTPClient` помечает user-статьи как `is_seeded=True`
**Файл:** `app/infrastructure/scopus_client.py`, строка `is_seeded=True` в конструкторе `Article`. Клиент вызывается как сидером, так и `SearchService.find_and_save()`. Флаг всегда `True` — разделения нет.

### Дефект D-2: Публичный `GET /articles/` не фильтрует по `is_seeded`
**Файл:** `app/infrastructure/postgres_article_repo.py`, метод `get_all()`. Запрос выбирает все записи из `articles`. Анонимам видны результаты поиска авторизованных пользователей.

### Дефект D-3: Upsert перезаписывает `keyword` и `is_seeded` при конфликте по DOI
**Файл:** `app/infrastructure/postgres_article_repo.py`, метод `save_many()`, блок `set_={}`. Если статья уже есть в коллекции (`is_seeded=True`, `keyword="neural network"`), а пользователь ищет "deep learning" — upsert перепишет оба поля.

### Дефект D-4: Нет связи `search_history → articles`
**Файл:** `app/models/search_history.py`. Таблица хранит `query + result_count`, но не ссылки на конкретные статьи. Нельзя вернуть пользователю результаты прошлого поиска — только список запросов.

### Дефект D-5: `ArticleResponse` возвращает `keyword` клиенту
**Файл:** `app/schemas/article_schemas.py`. Поле `keyword: str` в `ArticleResponse` — это артефакт сидера (технический ярлык), который не несёт ценности для пользователя и не должен быть в публичном API.

### Дефект D-6: `get_search_stats()` агрегирует по всей таблице без изоляции
**Файл:** `app/infrastructure/postgres_article_repo.py`, метод `get_search_stats()`. CTE-запрос ищет по `articles` без фильтрации по `user_id` — агрегаты смешивают данные всех пользователей.

---

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
    doi              VARCHAR(255),
    cited_by_count   INTEGER,
    document_type    VARCHAR(100),
    open_access      BOOLEAN,
    affiliation_country VARCHAR(100),
    created_at       TIMESTAMPTZ DEFAULT now() NOT NULL
)
```

**Индексы:**
- `ix_articles_doi_unique` — существующий partial UNIQUE INDEX по `doi WHERE doi IS NOT NULL`, сохраняется без изменений.
- `ix_articles_no_doi_unique` — **новый** partial UNIQUE INDEX: `CREATE UNIQUE INDEX ix_articles_no_doi_unique ON articles(title, publication_date, author) WHERE doi IS NULL`. Необходим для корректного upsert статей без DOI (замечание A-1).

### Таблица `catalog_articles` — коллекция сидера (НОВАЯ)

Принадлежность статьи коллекции ИИ — отдельная сущность, а не флаг.

```sql
catalog_articles (
    id          SERIAL PRIMARY KEY,
    article_id  INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
    keyword     VARCHAR(100) NOT NULL,
    seeded_at   TIMESTAMPTZ DEFAULT now() NOT NULL,
    CONSTRAINT uq_catalog_articles_article_id UNIQUE (article_id)
)
-- INDEX: ix_catalog_articles_keyword (keyword)
-- INDEX: ix_catalog_articles_article_id (article_id)
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
    rank              SMALLINT NOT NULL,
    CONSTRAINT uq_sra_history_article UNIQUE (search_history_id, article_id)
)
-- INDEX: ix_sra_search_history_id (search_history_id) — единственный нужный индекс,
--        главный путь чтения для всех запросов к этой таблице.
--        ix_sra_article_id намеренно не создаётся: ни один эндпоинт не ищет
--        по article_id без search_history_id — добавить при появлении реального запроса.
```

---

## 3. Новые интерфейсы (контракты)

### `ICatalogRepository` (новый)

```python
class ICatalogRepository(ABC):
    async def get_all(limit, offset, keyword=None, search=None) -> list[Article]
    async def get_total_count(keyword=None, search=None) -> int
    async def save_seeded(articles: list[Article], keyword: str) -> list[Article]
    async def get_stats() -> dict
```

> **Замечание S-1:** метод `is_article_in_catalog(article_id)` удалён из интерфейса.
> Логика видимости статьи инкапсулирована в `IArticleRepository.get_by_id()` одним
> JOIN-запросом (см. раздел 5). Отдельный метод создавал бы лишний round-trip к БД.

### `ISearchResultRepository` (новый)

```python
class ISearchResultRepository(ABC):
    async def save_results(
        search_history_id: int,
        articles: list[Article],  # уже с id из БД
    ) -> None

    async def get_results_by_history_id(
        search_history_id: int,
        user_id: int,  # обязателен — авторизационная проверка владения одним запросом
    ) -> list[Article] | None
    # Реализация: один запрос с JOIN search_history WHERE id=:hist_id AND user_id=:uid.
    # Раздельные SELECT (сначала проверить владельца, затем получить данные) ЗАПРЕЩЕНЫ — race condition.
    # Если запись не найдена или user_id не совпадает — возвращает None → роутер отдаёт 404.

    async def get_search_stats_for_user(
        user_id: int,
        search: str | None = None,
        since: datetime | None = None,
    ) -> dict
    # Агрегирует ВСЕ статьи из всех поисков пользователя:
    # search_result_articles JOIN search_history WHERE user_id = :uid.
    # search — опциональный ILIKE-фильтр по articles.title/author.
    # since  — опциональный фильтр по search_history.created_at (для будущего UI-фильтра "за N дней").
    # Без фильтров: полный агрегат по всем поискам пользователя.
```

### `IArticleRepository` (изменяется)

Удаляются методы, которые уходят в другие репозитории:
- `get_all()` → в `ICatalogRepository`
- `get_total_count()` → в `ICatalogRepository`
- `get_stats()` → в `ICatalogRepository`
- `get_search_stats()` → в `ISearchResultRepository`

Остаётся в `IArticleRepository`:

```python
class IArticleRepository(ABC):
    async def upsert_many(articles: list[Article]) -> list[Article]
    # Чистый upsert без is_seeded/keyword — только нормализованные поля статьи.
    # Управление транзакцией: upsert_many использует ТОЛЬКО flush(), НЕ commit().
    # commit() вызывается исключительно на уровне сервиса.

    async def get_by_id(
        article_id: int,
        user_id: int | None = None,
    ) -> Article | None
    # Реализация логики видимости одним JOIN-запросом (замечание S-1):
    #
    #   SELECT a.* FROM articles a
    #   LEFT JOIN catalog_articles ca ON ca.article_id = a.id
    #   WHERE a.id = :article_id
    #     AND (
    #       ca.article_id IS NOT NULL          -- статья в публичной коллекции
    #       OR (
    #         :user_id IS NOT NULL             -- авторизованный пользователь
    #         AND EXISTS (
    #           SELECT 1 FROM search_result_articles sra
    #           JOIN search_history sh ON sh.id = sra.search_history_id
    #           WHERE sra.article_id = a.id AND sh.user_id = :user_id
    #         )
    #       )
    #     )
    #
    # Если статья не найдена или не видима — возвращает None → роутер отдаёт 404.
    # Отдельный вызов is_article_in_catalog() запрещён — лишний round-trip.
```

### `ISearchHistoryRepository` (без изменений контракта)

Метод `insert_row` уже возвращает `SearchHistory` с заполненным `id` (реализовано через `flush`). Контракт сохраняется.

---

## 4. Новые сервисы

### `SearchService.find_and_save()` — новая оркестрация

Текущий поток:
```
Scopus → save_many(articles) → insert_row(history)
```

Новый поток:
```
Scopus
  → upsert_many(articles)               # нормализованный реестр, только flush()
  → insert_row(history)                 # запись истории, получаем search_history.id, только flush()
  → save_results(history_id, articles)  # привязка статей к этой истории, только flush()
  → await session.commit()              # единственный commit для всех трёх операций
  → return (history, articles)          # кортеж: SearchHistory + list[Article]
```

**Требование к атомарности (замечание B-1):** Все три операции выполняются в одной транзакции. Репозитории используют только `flush()`. `commit()` вызывается **единожды** в `find_and_save` после успеха всех трёх операций. При любой ошибке — `await session.rollback()`. Это правило фиксируется как инвариант всего слоя инфраструктуры: _«Репозитории используют только `flush()`. `commit()` вызывается исключительно на уровне сервиса или Unit of Work»_.

**Контракт возвращаемого значения (замечание A-2):** `find_and_save` возвращает `tuple[SearchHistory, list[Article]]`. Роутер использует `history.id` для формирования `SearchResultsResponse` и заголовка `Location: /articles/history/{history.id}/results`.

### `CatalogService` (новый, выделить из `ArticleService`)

Инкапсулирует всю логику публичной коллекции:
- `get_paginated()` — публичный листинг через `ICatalogRepository`
- `get_stats()` — публичная статистика только по коллекции
- `search_in_catalog()` — полнотекстовый поиск по `catalog_articles JOIN articles`
- `seed(keyword, articles)` — запись новых статей в коллекцию (вызывается сидером, см. раздел 4а)

### `ArticleService` (сокращается)

После рефакторинга `ArticleService` содержит только:
- `get_by_id()` — вызывает `IArticleRepository.get_by_id(article_id, user_id=current_user_id)` и отдаёт `404` при `None`.

### 4а. Изменения сидера (замечание B-2)

Сидер вызывает `CatalogService.seed(keyword, articles)`, который:
1. Вызывает `IArticleRepository.upsert_many(articles)` — нормализованный реестр.
2. Вызывает `ICatalogRepository.save_seeded(article_ids, keyword)` — регистрация в коллекции.
3. Вызывает `await session.commit()` — единственный commit.

`ScopusHTTPClient` больше не выставляет `is_seeded=True`. Клиент создаёт объекты `Article` только с полями нормализованного реестра. Принадлежность коллекции передаётся явно через `CatalogService.seed(keyword=...)`.

---

## 5. Изменения роутеров

| Эндпоинт | Тип | Что меняется |
|---|---|---|
| `GET /articles/` | Публичный | Читает через `CatalogService` → только `catalog_articles JOIN articles` |
| `GET /articles/stats` | Публичный | Читает через `CatalogService` → агрегаты только по коллекции |
| `GET /articles/find` | Приватный | Возвращает `SearchResultsResponse` из `search_result_articles` текущего пользователя |
| `GET /articles/search/stats` | Приватный | Агрегаты через `ISearchResultRepository.get_search_stats_for_user(user_id=current_user.id, search=...)` |
| `GET /articles/history` | Приватный | Без изменений — возвращает записи `search_history` пользователя |
| `GET /articles/find/quota` | Приватный | Без изменений |
| `GET /articles/{id}` | Публичный | Логика видимости через `IArticleRepository.get_by_id(id, user_id)` — см. ниже |
| **NEW** `GET /articles/history/{id}/results` | Приватный | Результаты конкретного прошлого поиска |

### `GET /articles/{article_id}` — ограничение видимости (замечания A-4, S-1)

Роутер вызывает `ArticleService.get_by_id(article_id, user_id=current_user_id_or_None)`. Сервис делегирует в `IArticleRepository.get_by_id()`, который выполняет один JOIN-запрос с проверкой принадлежности коллекции и — для авторизованных — принадлежности поиску пользователя. При `None` — `404 Not Found`.

### `GET /articles/search/stats` — изоляция агрегатов (замечание A-3)

Переключается с `ArticleService` на новый `SearchResultService`. Агрегирует по:
```sql
search_result_articles
  JOIN search_history ON search_history.id = search_result_articles.search_history_id
  JOIN articles       ON articles.id = search_result_articles.article_id
WHERE search_history.user_id = :current_user_id
  [AND (articles.title ILIKE :pattern OR articles.author ILIKE :pattern)]
```
Параметр `search` — опциональный ILIKE-фильтр внутри уже изолированного набора данных пользователя.

### `GET /articles/history/{id}/results` — авторизационная проверка (замечание C-1)

Авторизация реализуется через **один атомарный запрос**:
```sql
SELECT articles.*
FROM search_result_articles sra
  JOIN search_history sh ON sh.id = sra.search_history_id
  JOIN articles a ON a.id = sra.article_id
WHERE sh.id = :hist_id
  AND sh.user_id = :current_user_id
ORDER BY sra.rank
```
Раздельные SELECT **запрещены** — TOCTOU race condition. Если запись не найдена или `user_id` не совпадает — `404 Not Found` (не `403` — чтобы не раскрывать существование чужих записей).

### Защита от анонимного поиска (замечание D-2)

Все эндпоинты, изменяющие состояние пользователя (`/find`, `/history`, `/find/quota`, `/history/{id}/results`), зависят от `Depends(get_current_user)` — FastAPI вернёт `401 Unauthorized` до входа в тело обработчика. На уровне БД дополнительная защита: `search_history.user_id NOT NULL` с FK делает вставку без валидного `user_id` невозможной. Оба уровня защиты обязательны.

### Advisory lock (замечание C-3)

Advisory lock в `GET /articles/find` сохраняется. **Назначение:** предотвратить параллельное выполнение двух поисков одним пользователем, что привело бы к двойному расходу квоты до фиксации первого результата. Атомарность `find_and_save` защищает согласованность данных, но не устраняет race на квоту — это задача advisory lock.

Ключ блокировки вычисляется как `user_id % (2**63 - 1)` для гарантии попадания в диапазон `bigint`. Если `users.id` в будущем станет UUID — ключ вычисляется как `abs(hash(str(user_id))) % (2**63 - 1)`.

---

## 6. Изменения схем Pydantic

### `ArticleResponse` — удалить `keyword`

`keyword` — технический атрибут сидера, клиенту не нужен.

### `SearchHistoryItemResponse` — поле `results_available: bool`

Поле вычисляется как `result_count > 0` — без дополнительных запросов к БД (замечание S-2).

**Инвариант:** запись `search_history` с `result_count > 0` **всегда** имеет соответствующие строки в `search_result_articles`, поскольку обе операции выполняются атомарно в `find_and_save`. Реализация через `EXISTS (SELECT 1 FROM search_result_articles ...)` при листинге истории **запрещена** — N+1 запросов.

### Новая схема `SearchResultsResponse`

```python
class SearchResultsResponse(BaseModel):
    search_history_id: int
    query: str
    created_at: datetime
    articles: list[ArticleResponse]
```

---

## 7. Alembic миграция `0006_refactor_article_ownership`

### Фаза 1 — Создать новые таблицы и индексы (не разрушающая)

```sql
-- Новый partial unique index для статей без DOI (замечание A-1)
CREATE UNIQUE INDEX ix_articles_no_doi_unique
    ON articles(title, publication_date, author)
    WHERE doi IS NULL;

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
-- Только один индекс — главный путь чтения (замечание S-3)
CREATE INDEX ix_sra_search_history_id ON search_result_articles(search_history_id);
```

### Фаза 2 — Перенести данные коллекции (с dry-run верификацией)

**Перед запуском — обязательный верификационный шаг (замечание D-3):**
```sql
-- Выполнить вручную, проверить результат до запуска миграции
SELECT
    COUNT(*)                                     AS total_to_delete,
    COUNT(*) FILTER (WHERE is_seeded = TRUE)     AS seeded_to_migrate,
    COUNT(*) FILTER (WHERE is_seeded = FALSE)    AS orphans_to_delete,
    MIN(created_at)                              AS oldest,
    MAX(created_at)                              AS newest
FROM articles;
```
Если `orphans_to_delete > 0` — разработчик анализирует записи вручную перед продолжением. `DELETE` необратим: данные `is_seeded=FALSE` не восстанавливаются при `downgrade()`. Это зафиксировано в комментарии миграции.

```sql
-- Переносим все is_seeded=TRUE статьи в catalog_articles
INSERT INTO catalog_articles (article_id, keyword, seeded_at)
SELECT id, keyword, created_at
FROM   articles
WHERE  is_seeded = TRUE
ON CONFLICT DO NOTHING;

-- Удаляем orphan-статьи (is_seeded=FALSE — user-статьи без владельца)
-- НЕОБРАТИМО. Предварительно выполнить верификационный SELECT выше.
DELETE FROM articles WHERE is_seeded = FALSE;
```

### Фаза 3 — Удалить устаревшие колонки (выполняется после готовности кода)

```sql
ALTER TABLE articles DROP COLUMN is_seeded;
ALTER TABLE articles DROP COLUMN keyword;
```

### `downgrade()`

Восстанавливает колонки `is_seeded` (default `false`) и `keyword` (default `''`), переносит данные обратно из `catalog_articles`, удаляет новые таблицы и индексы. **Данные `is_seeded=FALSE` строк не восстанавливаются.**

---

## 8. Инфраструктура: ключевые требования реализации

### Управление транзакциями (замечание B-1)

Инвариант всего слоя инфраструктуры: **репозитории используют только `flush()`, никогда `commit()`**. `commit()` вызывается исключительно на уровне сервиса. Нарушение этого правила ломает атомарность составных операций.

### `upsert_many` — два батчевых INSERT (замечания A-1, B-3)

`upsert_many` выполняет **два отдельных батчевых** `INSERT ... ON CONFLICT`:

1. **Статьи с DOI** → `ON CONFLICT ON CONSTRAINT ix_articles_doi_unique DO UPDATE SET ...`
2. **Статьи без DOI** → `ON CONFLICT ON CONSTRAINT ix_articles_no_doi_unique DO UPDATE SET ...`

После обоих INSERT перечитывание всех записей выполняется **двумя** батчевыми SELECT:
- `SELECT ... WHERE doi IN (:dois)` — для статей с DOI
- `SELECT ... WHERE (title, publication_date, author) IN (:tuples) AND doi IS NULL` — для статей без DOI

Цикловые SELECT по одной записи (`for a in articles: SELECT ...`) **запрещены** — N+1 запросов.

### ILIKE-экранирование (замечание C-2)

Все методы, использующие ILIKE-паттерн, **обязаны** экранировать входную строку через утилитарную функцию `escape_ilike(s: str) -> str`, размещённую в `app/utils/db_utils.py`:

```python
def escape_ilike(s: str) -> str:
    # Экранируем спецсимволы ILIKE: \, %, _
    return s.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
```

Паттерн формируется как `f"%{escape_ilike(search)}%"`, запрос использует `ILIKE :pattern ESCAPE '\\'`. Прямое форматирование `f"%{search}%"` без экранирования запрещено.

---

## 9. Изменения в `ScopusHTTPClient`

Убрать `is_seeded=True` из конструктора `Article`. После рефакторинга клиент создаёт объекты `Article` только с полями нормализованного реестра (`title`, `journal`, `author`, `publication_date`, `doi`, `cited_by_count`, `document_type`, `open_access`, `affiliation_country`). Поля `keyword` и `is_seeded` удалены из модели.

---

## 10. Затронутые файлы — сводная таблица

| Файл | Тип изменения |
|---|---|
| `app/models/article.py` | Удалить `keyword`, `is_seeded` |
| `app/models/catalog_article.py` | **Создать** |
| `app/models/search_result_article.py` | **Создать** |
| `app/interfaces/article_repository.py` | Удалить `get_all`, `get_total_count`, `get_stats`, `get_search_stats`; переименовать `save_many` → `upsert_many`; расширить сигнатуру `get_by_id(id, user_id=None)`; зафиксировать запрет на `commit()` |
| `app/interfaces/catalog_repository.py` | **Создать** (без `is_article_in_catalog`) |
| `app/interfaces/search_result_repo.py` | **Создать** |
| `app/infrastructure/postgres_article_repo.py` | Переписать `upsert_many`: два батчевых INSERT; расширить `get_by_id`: JOIN-запрос с логикой видимости |
| `app/infrastructure/postgres_catalog_repo.py` | **Создать** |
| `app/infrastructure/postgres_search_result_repo.py` | **Создать** (включая атомарную авторизационную проверку) |
| `app/services/article_service.py` | Сократить до `get_by_id(article_id, user_id=None)` |
| `app/services/catalog_service.py` | **Создать** (включая метод `seed`) |
| `app/services/search_service.py` | Переписать `find_and_save`: три flush + один commit, возврат `tuple[SearchHistory, list[Article]]` |
| `app/infrastructure/scopus_client.py` | Убрать `is_seeded=True` и `keyword` из `Article()` |
| `app/routers/articles.py` | Заменить зависимости; добавить `GET /history/{id}/results`; исправить `search/stats` и `/{article_id}`; advisory lock |
| `app/schemas/article_schemas.py` | Удалить `keyword` из `ArticleResponse`; добавить `SearchResultsResponse`; `results_available = result_count > 0` |
| `app/utils/db_utils.py` | **Создать** — `escape_ilike()` |
| `alembic/versions/0006_refactor_article_ownership.py` | **Создать** |
| Тесты — все файлы с `save_many`, `is_seeded`, `ArticleService` | Обновить |

---

## 11. Порядок реализации

1. **Миграция Фаза 1** — создать новые таблицы и индексы (включая `ix_articles_no_doi_unique`, без `ix_sra_article_id`)
2. **Утилиты** — `app/utils/db_utils.py` с `escape_ilike()`
3. **Модели** — `CatalogArticle`, `SearchResultArticle`, обновить `Article` (убрать `keyword`, `is_seeded`)
4. **Интерфейсы** — `ICatalogRepository` (без `is_article_in_catalog`), `ISearchResultRepository`, обновить `IArticleRepository`
5. **Инфраструктура** — `postgres_catalog_repo.py`, `postgres_search_result_repo.py`, переписать `postgres_article_repo.py`
6. **Сервисы** — `CatalogService` (с методом `seed`), переписать `SearchService.find_and_save`
7. **Роутер** — переключить зависимости, добавить `GET /history/{id}/results`, исправить `search/stats` и `/{article_id}`
8. **Схемы** — обновить `ArticleResponse`, `SearchHistoryItemResponse` (`result_count > 0`), добавить `SearchResultsResponse`
9. **Миграция Фаза 2** — верификационный SELECT, перенос данных, DELETE orphans
10. **Миграция Фаза 3** — удалить колонки `keyword`, `is_seeded`
11. **Сидер** — переключить на `CatalogService.seed()`
12. **Тесты** — обновить fixtures и unit-тесты

У меня достаточно данных для полного анализа. Составляю план.

***

# Обновлённый план реализации ТЗ: Рефакторинг хранения данных и поисковых запросов

> **Статус на 22.04.2026, 14:57 CEST** — Ветка `db-refactoring`. Шаги 1–3 завершены (4 коммита). Остаётся Шаги 4–7 + ручные операции М-1…М-6.

***

## Что уже сделано: анализ выполненных коммитов

Начиная с коммита [`977a545`](https://github.com/HelgDemidov/scopus_search_code/commit/977a545d1d40d7ba1e175293be707668cf77b3b1) в ветку `db-refactoring` влиты четыре рабочих коммита.

### ✅ Шаг 1 — Миграция Фаза 1 (`977a545`, `6ad254`)

Коммиты `977a545` и `6ad254` вместе реализуют полную не-разрушающую Фазу 1 миграции `0006_refactor_article_ownership`.

Что создано в `upgrade()`:
- `ALTER TABLE articles ALTER COLUMN keyword DROP NOT NULL` — `keyword` стал nullable (необходимо для `upsert_many` до удаления колонки в Фазе 3)
- `ix_articles_no_doi_unique` — partial UNIQUE INDEX `(title, publication_date, author) WHERE doi IS NULL`
- Таблица `catalog_articles` с FK `article_id → articles.id ON DELETE CASCADE`, UNIQUE `(article_id)`, индексами по `article_id` и `keyword`
- Таблица `search_result_articles` с FK `search_history_id → search_history.id ON DELETE CASCADE` и `article_id → articles.id ON DELETE RESTRICT`, UNIQUE `(search_history_id, article_id)`, индексом `ix_sra_search_history_id`
- `ix_sra_article_id` намеренно **не** создаётся (замечание S-3)

`downgrade()` полностью реализован: откатывает все операции в обратном порядке, включая восстановление `NOT NULL` на `keyword`.

**⚠️ Статус применения к БД:** Миграция находится в коде, но не применена к Supabase — ручной шаг М-3 (см. ниже).

### ✅ Шаг 2 — Фундамент: модели, интерфейсы, утилиты (`984e3ff`)

Коммит [`984e3ff`](https://github.com/HelgDemidov/scopus_search_code/commit/984e3ff2c654ad87e7a11af55b009527a77b155e) добавил 7 файлов.

**Создано:**
- `app/utils/__init__.py` — маркер пакета
- `app/utils/db_utils.py` — `escape_ilike()`: экранирование `\`, `%`, `_` для безопасных ILIKE-паттернов
- `app/models/catalog_article.py` — ORM-модель `CatalogArticle`
- `app/models/search_result_article.py` — ORM-модель `SearchResultArticle`
- `app/interfaces/catalog_repository.py` — `ICatalogRepository` ABC (без `is_article_in_catalog`, согласно упрощению S-1)
- `app/interfaces/search_result_repo.py` — `ISearchResultRepository` ABC

**Обновлено:**
- `app/interfaces/article_repository.py` — `save_many` → `upsert_many`; удалены `get_all`, `get_total_count`, `get_stats`, `get_search_stats`; `get_by_id` расширен параметром `user_id: int | None = None`; зафиксирован запрет на `commit()`

### ✅ Шаг 3 — Рефакторинг `postgres_article_repo` (`bad6b1`, `ad2f36`)

Коммиты `bad6b1` (модель) и `ad2f36` (репозиторий) завершили Шаг 3.

**`app/models/article.py`** — `keyword` переведён в `nullable=True` (временно, до миграции 0007):
```python
keyword: Mapped[str | None] = mapped_column(String(100), nullable=True)
```
`is_seeded` остаётся `nullable=False` с `server_default="false"` — физически не трогается до Фазы 3.

**`app/infrastructure/postgres_article_repo.py`** — полностью переписан:
- `upsert_many`: два батчевых `INSERT ON CONFLICT` (батч по DOI + батч по `ix_articles_no_doi_unique`) + два батчевых SELECT для перечитывания. Только `flush()`, без `commit()`. N+1 запросов нет.
- `get_by_id(article_id, user_id=None)`: единый JOIN-запрос с логикой видимости: `catalog_articles EXISTS` OR (если `user_id` передан) `search_result_articles JOIN search_history WHERE user_id = :uid EXISTS`.

***

## Критические несоответствия ТЗ в текущем коде

Глубокий анализ текущего состояния выявил **4 расхождения**, которые необходимо устранить в оставшихся шагах.

### 🔴 Несоответствие 1: `upsert_many` всё ещё пишет `keyword` и `is_seeded`

В `postgres_article_repo.py` (коммит `ad2f36`) в `values_doi` и `values_no_doi` по-прежнему включены поля `keyword` и `is_seeded`:
```python
"keyword":   a.keyword,
"is_seeded": a.is_seeded,
```
...а `set_` ON CONFLICT их обновляет. Это нарушает дефект D-3 из ТЗ: если статья уже в каталоге (`is_seeded=True`, `keyword="neural network"`), пользовательский поиск перезапишет оба поля.

**Исправление в Шаге 4:** убрать `keyword` и `is_seeded` из `values_doi`, `values_no_doi` и из блоков `set_={}` в обоих батчах `upsert_many`.

### 🔴 Несоответствие 2: `scopus_client.py` всё ещё пишет `is_seeded=True` и `keyword=keyword`

В `app/infrastructure/scopus_client.py` конструктор `Article()` по-прежнему передаёт:
```python
keyword=keyword[:100],
is_seeded=True,
```
Это дефект D-1 из ТЗ. После Шага 4 клиент должен создавать `Article` только с нормализованными полями.

### 🔴 Несоответствие 3: `search_service.py` вызывает `save_many` и не создаёт `search_result_articles`

`SearchService.find_and_save` вызывает `self.article_repo.save_many(articles)` (метод которого уже нет в интерфейсе) и не вызывает `save_results`. Это означает, что связь `search_history → search_result_articles` не создаётся — эндпоинт `GET /history/{id}/results` не будет работать. Дефект D-4 из ТЗ не устранён.

### 🔴 Несоответствие 4: роутер, сервисы и схемы не переключены на новые зависимости

`articles.py` использует `ArticleService` для `GET /articles/` и `GET /articles/stats` — оба метода удалены из интерфейса. `article_service.py` содержит методы `get_articles_paginated`, `get_search_stats`, `get_stats`, которые обращаются к несуществующим методам репозитория. `ArticleResponse` всё ещё содержит `keyword: str`. `GET /history/{id}/results` отсутствует в роутере.

***

## Оставшиеся шаги: подробный план коммитов

### Шаг 4 — Исправление инфраструктуры и `ScopusHTTPClient`

**1 коммит:** `step4: fix upsert_many fields, scopus_client — remove is_seeded/keyword`

| Файл | Изменение |
|---|---|
| `app/infrastructure/postgres_article_repo.py` | Убрать `keyword` и `is_seeded` из `values_doi`, `values_no_doi` и обоих `set_={}` в `upsert_many` |
| `app/infrastructure/scopus_client.py` | Убрать `keyword=keyword[:100]` и `is_seeded=True` из конструктора `Article()` |

**Детальное изменение `upsert_many`:**

До:
```python
values_doi = [
    {
        "title": a.title, ...,
        "keyword":   a.keyword,    # ← убрать
        "is_seeded": a.is_seeded,  # ← убрать
    } for a in with_doi
]
# и в set_={}:
"keyword":   insert(Article).excluded.keyword,    # ← убрать
"is_seeded": insert(Article).excluded.is_seeded,  # ← убрать
```

**Важно:** `keyword` и `is_seeded` остаются в БД-схеме до миграции 0007 — но `upsert_many` их больше не пишет. Существующие строки с `is_seeded=True` и `keyword` сохранятся нетронутыми до Фазы 2 (ручной перенос в `catalog_articles`). ON CONFLICT DO UPDATE для полей, которых нет в `set_`, не затрагивает их — это корректное поведение PostgreSQL.

**Детальное изменение `scopus_client.py`:**

```python
# До:
article = Article(
    title=title[:500], ...,
    keyword=keyword[:100],  # ← убрать
    is_seeded=True,          # ← убрать
)

# После:
article = Article(
    title=title[:500],
    journal=journal[:500] if journal else None,
    author=creator[:255] if creator else None,
    publication_date=cover_date,
    doi=doi[:255] if doi else None,
    cited_by_count=cited_by_count,
    document_type=document_type[:100] if document_type else None,
    open_access=open_access,
    affiliation_country=affiliation_country[:100] if affiliation_country else None,
    # keyword и is_seeded не передаются — БД использует server_default
)
```

Колонка `keyword` уже `nullable=True` (после миграции 0006), `is_seeded` имеет `server_default="false"` — вставка без этих полей пройдёт без ошибок.

***

### Шаг 5 — Новые инфраструктурные репозитории

**1 коммит:** `step5: postgres_catalog_repo + postgres_search_result_repo`

| Файл | Действие |
|---|---|
| `app/infrastructure/postgres_catalog_repo.py` | **Создать** — реализует `ICatalogRepository` |
| `app/infrastructure/postgres_search_result_repo.py` | **Создать** — реализует `ISearchResultRepository` |

#### `postgres_catalog_repo.py` — ключевые точки реализации:

- `get_all(limit, offset, keyword=None, search=None)` — `SELECT articles.* FROM catalog_articles JOIN articles ON ...` с опциональными ILIKE-фильтрами через `escape_ilike()`
- `get_total_count(keyword=None, search=None)` — аналогичный COUNT без пагинации
- `save_seeded(articles, keyword)` — `INSERT INTO catalog_articles (article_id, keyword, seeded_at) ... ON CONFLICT DO NOTHING`; использует только `flush()`, не `commit()`
- `get_stats()` — CTE-запрос по `catalog_articles JOIN articles`: `by_year`, `by_journal`, `by_country`, `by_doc_type`, `top_keywords` (агрегаты только по каталогу)

**ILIKE-паттерн обязательно через `escape_ilike()`:**
```python
from app.utils.db_utils import escape_ilike
pattern = f"%{escape_ilike(search)}%"
stmt = stmt.where(
    sa.or_(
        Article.title.ilike(pattern),
        Article.author.ilike(pattern),
    )
)
```

#### `postgres_search_result_repo.py` — ключевые точки реализации:

- `save_results(search_history_id, articles)` — батчевый INSERT в `search_result_articles` с полем `rank` (порядковый номер = индекс в списке `articles`); только `flush()`
- `get_results_by_history_id(search_history_id, user_id)` — **один атомарный запрос**:
  ```sql
  SELECT articles.*
  FROM search_result_articles sra
    JOIN search_history sh ON sh.id = sra.search_history_id
    JOIN articles a ON a.id = sra.article_id
  WHERE sh.id = :hist_id
    AND sh.user_id = :current_user_id
  ORDER BY sra.rank
  ```
  Раздельные SELECT запрещены (TOCTOU race condition). Если `None` — роутер отдаёт 404 (не 403).
- `get_search_stats_for_user(user_id, search=None, since=None)` — агрегаты по `search_result_articles JOIN search_history WHERE user_id = :uid` с опциональными фильтрами через `escape_ilike()`

***

### Шаг 6 — Новые сервисы и рефакторинг существующих

**1 коммит:** `step6: catalog_service, search_service rewrite, article_service trim`

| Файл | Действие |
|---|---|
| `app/services/catalog_service.py` | **Создать** |
| `app/services/search_service.py` | Переписать `find_and_save` |
| `app/services/article_service.py` | Сократить до `get_by_id` |

#### `catalog_service.py` — полная структура:

```python
class CatalogService:
    def __init__(
        self,
        catalog_repo: ICatalogRepository,
        article_repo: IArticleRepository,
        session: AsyncSession,
    ):
        ...

    async def get_paginated(self, page, size, keyword=None, search=None) -> PaginatedArticleResponse:
        # Делегирует в catalog_repo.get_all() и get_total_count()
        ...

    async def get_stats(self) -> dict:
        # Делегирует в catalog_repo.get_stats()
        ...

    async def seed(self, keyword: str, articles: list[Article]) -> list[Article]:
        # 1. article_repo.upsert_many(articles) — flush()
        # 2. catalog_repo.save_seeded(saved_articles, keyword) — flush()
        # 3. await session.commit()  ← единственный commit
        saved = await self.article_repo.upsert_many(articles)
        await self.catalog_repo.save_seeded(saved, keyword)
        await self.session.commit()
        return saved
```

#### `search_service.py` — новая оркестрация `find_and_save`:

```python
async def find_and_save(
    self, keyword, count=25, *, user_id: int, filters=None
) -> tuple[SearchHistory, list[Article]]:
    articles = await self.search_client.search(keyword=keyword, count=count)
    if not articles:
        # Создаём запись истории с result_count=0, commit, возвращаем пустой результат
        history = await self.history_repo.insert_row(
            user_id=user_id, query=keyword, result_count=0, filters=filters
        )
        await self.session.commit()
        return history, []

    # 1. Нормализованный реестр статей
    saved = await self.article_repo.upsert_many(articles)  # flush() внутри

    # 2. Запись истории — получаем search_history.id
    history = await self.history_repo.insert_row(
        user_id=user_id, query=keyword,
        result_count=len(saved), filters=filters
    )  # flush() внутри

    # 3. Привязка статей к этому поиску
    await self.search_result_repo.save_results(history.id, saved)  # flush() внутри

    # 4. Единственный commit для всех трёх операций
    await self.session.commit()

    return history, saved
```

**Инвариант атомарности (B-1):** при любой ошибке до `commit()` SQLAlchemy откатит транзакцию автоматически при закрытии сессии. Явный `rollback()` не нужен при использовании `async with session` в FastAPI.

`SearchService.__init__` добавляет зависимость `search_result_repo: ISearchResultRepository` и `session: AsyncSession`.

#### `article_service.py` — сокращается до минимума:

```python
class ArticleService:
    def __init__(self, article_repo: IArticleRepository):
        self.article_repo = article_repo

    async def get_by_id(
        self, article_id: int, user_id: int | None = None
    ) -> ArticleResponse | None:
        article = await self.article_repo.get_by_id(article_id, user_id=user_id)
        if article is None:
            return None
        return ArticleResponse.model_validate(article)
```

Все остальные методы (`get_articles_paginated`, `get_search_stats`, `get_stats`) удаляются.

***

### Шаг 7 — API: схемы, роутер, DI

**1 коммит:** `step7: schemas, router refactor, DI wiring`

| Файл | Действие |
|---|---|
| `app/schemas/article_schemas.py` | Удалить `keyword` из `ArticleResponse`; добавить `SearchResultsResponse`; поле `results_available` в `SearchHistoryItemResponse` |
| `app/schemas/search_history_schemas.py` | Добавить `results_available: bool` в `SearchHistoryItemResponse` |
| `app/routers/articles.py` | Переключить зависимости; добавить `GET /history/{id}/results`; исправить `search/stats` и `/{article_id}`; изменить `find` на новый контракт |
| `app/core/dependencies.py` | Добавить провайдеры `CatalogService`, `ISearchResultRepository` |

#### `article_schemas.py` — изменения:

**Удалить `keyword` из `ArticleResponse`:**
```python
class ArticleResponse(BaseModel):
    id: int
    title: str
    journal: str | None
    author: str | None
    publication_date: date
    doi: str | None
    # keyword удалён (дефект D-5 из ТЗ)
    cited_by_count: int | None
    document_type: str | None
    open_access: bool | None
    affiliation_country: str | None

    model_config = {"from_attributes": True}
```

**Добавить `SearchResultsResponse`:**
```python
class SearchResultsResponse(BaseModel):
    search_history_id: int
    query: str
    created_at: datetime
    articles: list[ArticleResponse]
```

#### `search_history_schemas.py` — добавить `results_available`:

```python
class SearchHistoryItemResponse(BaseModel):
    id: int
    query: str
    created_at: datetime.datetime
    result_count: int
    filters: dict
    results_available: bool  # вычисляется как result_count > 0 (инвариант S-2)

    model_config = ConfigDict(from_attributes=True)
```

`results_available` вычисляется в сервисе или через `@computed_field`/`model_validator` из `result_count` — без дополнительных запросов к БД (запрет N+1, замечание S-2).

#### `articles.py` — ключевые изменения роутера:

**1. `GET /articles/` и `GET /articles/stats` → `CatalogService`:**
```python
def get_catalog_service(session: AsyncSession = Depends(get_db_session)) -> CatalogService:
    article_repo = PostgresArticleRepository(session)
    catalog_repo = PostgresCatalogRepository(session)
    return CatalogService(catalog_repo=catalog_repo, article_repo=article_repo, session=session)

@router.get("/stats", response_model=StatsResponse)
async def get_stats(service: CatalogService = Depends(get_catalog_service)):
    data = await service.get_stats()
    return StatsResponse(...)

@router.get("/", response_model=PaginatedArticleResponse)
async def get_articles(..., service: CatalogService = Depends(get_catalog_service)):
    return await service.get_paginated(page, size, keyword, search)
```

**2. `GET /articles/search/stats` → `ISearchResultRepository`:**
```python
@router.get("/search/stats", response_model=SearchStatsResponse)
async def get_search_stats(
    search: str = Query(..., min_length=2),
    search_result_repo: ISearchResultRepository = Depends(get_search_result_repo),
    current_user: User = Depends(get_current_user),
):
    data = await search_result_repo.get_search_stats_for_user(
        user_id=current_user.id, search=search
    )
    return SearchStatsResponse(...)
```

**3. `GET /articles/find` → обновлённый `SearchService`, возврат `SearchResultsResponse`:**
```python
@router.get("/find", response_model=SearchResultsResponse)
async def find_articles(...):
    # advisory lock + квота (без изменений)
    history, articles = await service.find_and_save(...)
    return SearchResultsResponse(
        search_history_id=history.id,
        query=history.query,
        created_at=history.created_at,
        articles=[ArticleResponse.model_validate(a) for a in articles],
    )
```

**4. NEW `GET /articles/history/{id}/results`** (зарегистрировать строго ДО `/{article_id}`):
```python
@router.get("/history/{history_id}/results", response_model=SearchResultsResponse)
async def get_history_results(
    history_id: int,
    search_result_repo: ISearchResultRepository = Depends(get_search_result_repo),
    current_user: User = Depends(get_current_user),
):
    articles = await search_result_repo.get_results_by_history_id(
        search_history_id=history_id, user_id=current_user.id
    )
    if articles is None:
        raise HTTPException(status_code=404, detail="Not found")
    # Получить запись истории для query и created_at
    # (через history_repo или передать в get_results_by_history_id возврат SearchHistory тоже)
    return SearchResultsResponse(
        search_history_id=history_id,
        query=...,
        created_at=...,
        articles=[ArticleResponse.model_validate(a) for a in articles],
    )
```

> **⚠️ Технический момент:** `get_results_by_history_id` возвращает `list[Article] | None`. Для формирования `SearchResultsResponse` нужен `query` и `created_at` из `search_history`. Два варианта: (а) расширить метод, чтобы возвращал `tuple[SearchHistory, list[Article]] | None`; (б) добавить отдельный вызов `history_repo.get_by_id(history_id)`. Вариант (а) предпочтительнее — один roundtrip, рекомендуется реализовать в `ISearchResultRepository`.

**5. `GET /articles/{article_id}` → `ArticleService.get_by_id(id, user_id)`:
```python
@router.get("/{article_id}", response_model=ArticleResponse)
async def get_article_by_id(
    article_id: int,
    service: ArticleService = Depends(get_article_service),
    current_user: User | None = Depends(get_optional_current_user),  # опциональный JWT
):
    article = await service.get_by_id(article_id, user_id=current_user.id if current_user else None)
    if article is None:
        raise HTTPException(status_code=404, detail="Article not found")
    return article
```

> **⚠️ Зависимость `get_optional_current_user`:** необходимо создать вариант зависимости, который возвращает `User | None` (не кидает 401 при отсутствии токена). Нужна для `GET /{article_id}` — публичный эндпоинт, но авторизованные пользователи видят также свои поиски.

**Порядок регистрации маршрутов** (критически важен для FastAPI):
```
GET /stats
GET /
GET /search/stats
GET /find/quota
GET /find
GET /history
GET /history/{history_id}/results   ← NEW — строго до /{article_id}
GET /{article_id}                    ← всегда последним
```

***

### Шаг 8 — Сидер и тесты

**2 коммита:**

#### Коммит 8a: `step8a: seeder — switch to CatalogService.seed()`

```python
# db_seeder/seeder__scripts/seed_db.py
# До:
saved = await article_repo.save_many(articles)

# После:
catalog_service = CatalogService(
    catalog_repo=PostgresCatalogRepository(session),
    article_repo=PostgresArticleRepository(session),
    session=session,
)
await catalog_service.seed(keyword=keyword, articles=articles)
```

`ScopusHTTPClient` больше не передаёт `is_seeded=True` и `keyword` — сидер передаёт `keyword` явно через `CatalogService.seed(keyword=...)`.

#### Коммит 8b: `step8b: tests update — search_service, article_service, catalog_service`

| Файл теста | Действие |
|---|---|
| `tests/unit/test_search_service.py` | Переписать: мокировать `upsert_many`, `insert_row`, `save_results`; проверить атомарность (один `commit`, три `flush`) |
| `tests/unit/test_article_service.py` | Удалить тесты `get_all`, `get_stats`, `get_search_stats`; оставить/переписать `get_by_id(id, user_id)` |
| `tests/unit/test_scopus_client.py` | Убрать проверку `is_seeded=True`; убрать проверку `keyword` в полях Article |
| `tests/unit/test_catalog_service.py` | **Создать**: тесты `seed()` (проверить `flush×2` + `commit×1`), `get_paginated()`, `get_stats()` |

***

## Ручные операции (не автоматизируются коммитами)

### 🔷 М-3 — Применить миграцию 0006 к Supabase

**Когда:** сразу, после `git pull` (миграция уже в репозитории с Шага 1).

```powershell
# В корне проекта (alembic.ini должен указывать на Supabase URL)
alembic upgrade 0006_refactor_article_ownership
alembic current
# Ожидается: 0006_refactor_article_ownership (head)
```

Если Alembic применяется к Supabase через прямой SQL, выполнить DDL из `upgrade()` в Supabase SQL Editor (скопировать содержимое `alembic/versions/0006_refactor_article_ownership.py`).

**Проверка:**
```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('catalog_articles', 'search_result_articles');
-- Должны появиться обе таблицы
```

***

### 🔷 М-1 — Верификационный SELECT перед Фазой 2

**Когда:** после завершения Шагов 4–8 и применения М-3. Выполнить в **Supabase SQL Editor**:

```sql
SELECT
    COUNT(*)                                     AS total_articles,
    COUNT(*) FILTER (WHERE is_seeded = TRUE)     AS seeded_to_migrate,
    COUNT(*) FILTER (WHERE is_seeded = FALSE)    AS orphans_to_delete,
    MIN(created_at)                              AS oldest,
    MAX(created_at)                              AS newest
FROM articles;
```

**Ожидаемый результат:** `orphans_to_delete = 0`. Если `orphans_to_delete > 0` — просмотреть вручную:

```sql
SELECT id, title, keyword, created_at
FROM articles
WHERE is_seeded = FALSE
LIMIT 20;
```

> Записи `is_seeded = FALSE` — это статьи из пользовательских поисков, сохранённых до рефакторинга. Их удаление необратимо. Если записей мало и они бессмысленны — удалить. Если много и они ценны — принять решение перед продолжением.

***

### 🔷 М-2 — Фаза 2: перенос данных в `catalog_articles`

**Когда:** только после `orphans_to_delete = 0` по М-1. Выполнить в **Supabase SQL Editor** транзакционно:

```sql
BEGIN;

-- Шаг 1: перенести все seeded-статьи
INSERT INTO catalog_articles (article_id, keyword, seeded_at)
SELECT id, keyword, created_at
FROM   articles
WHERE  is_seeded = TRUE
ON CONFLICT DO NOTHING;

-- Шаг 2: проверить результат переноса
SELECT COUNT(*) AS migrated FROM catalog_articles;
-- Должно совпасть с seeded_to_migrate из М-1

-- Шаг 3 (выполнить ТОЛЬКО после визуальной проверки шага 2):
-- Удалить orphan-статьи
-- ⚠️ НЕОБРАТИМО — данные is_seeded=FALSE не восстанавливаются при downgrade()
DELETE FROM articles WHERE is_seeded = FALSE;

COMMIT;
```

***

### 🔷 М-4 + коммит 9 — Фаза 3: удаление колонок

**Когда:** после подтверждения успешного М-2.

**Коммит `step9: migration 0007 — drop keyword, is_seeded columns`:**

Создать `alembic/versions/0007_drop_article_legacy_columns.py`:
```python
def upgrade() -> None:
    op.drop_column('articles', 'is_seeded')
    op.drop_column('articles', 'keyword')

def downgrade() -> None:
    op.add_column('articles', sa.Column('keyword', sa.String(100), nullable=True))
    op.add_column('articles', sa.Column('is_seeded', sa.Boolean(),
        server_default=sa.text('false'), nullable=False))
    # Данные is_seeded=FALSE-строк не восстанавливаются — зафиксировано в комментарии
```

**Одновременно в том же коммите** обновить `app/models/article.py` — удалить поля `keyword` и `is_seeded`. Модель и миграция должны попасть в репозиторий **вместе** — иначе приложение упадёт при старте до применения миграции к БД.

Применить к Supabase:
```powershell
alembic upgrade 0007_drop_article_legacy_columns
```

Или в Supabase SQL Editor:
```sql
ALTER TABLE articles DROP COLUMN IF EXISTS is_seeded;
ALTER TABLE articles DROP COLUMN IF EXISTS keyword;
```

***

### 🔷 М-5 — Проверка `.importlinter`

**Когда:** после Шагов 4–8.

```powershell
# В корне проекта
lint-imports
```

После добавления `app/utils/`, `app/services/catalog_service.py`, новых инфраструктурных файлов — убедиться, что правила граней архитектуры не нарушены. При нарушениях — добавить новые модули в разрешённые слои в `.importlinter`.

***

## Сводная таблица статусов

| Шаг | Описание | Статус | Коммит(ы) |
|---|---|---|---|
| 1 | Миграция 0006 Фаза 1 (DDL) | ✅ Готово | `977a545`, `6ad254` |
| 2 | Фундамент: модели, интерфейсы, утилиты | ✅ Готово | `984e3ff` |
| 3 | `postgres_article_repo` + `scopus_client` (частично) | ✅ Частично | `bad6b1`, `ad2f36` |
| М-3 | Применить 0006 к Supabase | ⏳ Ручное действие | — |
| 4 | Убрать `keyword`/`is_seeded` из `upsert_many` и `scopus_client` | 🔴 Не сделано | `step4` |
| 5 | `postgres_catalog_repo` + `postgres_search_result_repo` | 🔴 Не сделано | `step5` |
| 6 | `CatalogService`, рефакторинг `SearchService`, сокращение `ArticleService` | 🔴 Не сделано | `step6` |
| 7 | Схемы, роутер, DI | 🔴 Не сделано | `step7` |
| 8a | Сидер → `CatalogService.seed()` | 🔴 Не сделано | `step8a` |
| 8b | Тесты | 🔴 Не сделано | `step8b` |
| М-1 | Верификационный SELECT | ⏳ После Шагов 4–8 | — |
| М-2 | Перенос данных в `catalog_articles`, DELETE orphans | ⏳ После М-1 | — |
| 9 | Миграция 0007 (DROP COLUMN) + обновление `Article` модели | ⏳ После М-2 | `step9` |
| М-4 | Применить 0007 к Supabase | ⏳ После шага 9 | — |
| М-5 | `lint-imports` | ⏳ После Шагов 4–8 | — |

***

## Порядок выполнения оставшейся работы

```
М-3: alembic upgrade 0006 → Supabase (сейчас, сразу)
    ↓
Шаг 4: исправить upsert_many + scopus_client (коммит)
    ↓
Шаг 5: postgres_catalog_repo + postgres_search_result_repo (коммит)
    ↓
Шаг 6: CatalogService + SearchService + ArticleService (коммит)
    ↓
Шаг 7: схемы + роутер + DI (коммит)
    ↓
Шаг 8a: сидер (коммит)
    ↓
Шаг 8b: тесты (коммит)
    ↓
М-5: lint-imports (локально)
    ↓
М-1: верификационный SELECT (Supabase)
    ↓
М-2: перенос данных + DELETE orphans (Supabase)
    ↓
Шаг 9 + М-4: миграция 0007 (коммит + Supabase)
```

***

## Риски регрессий и меры защиты

| Риск | Уровень | Мера защиты |
|---|---|---|
| `upsert_many` перезаписывает `keyword`/`is_seeded` у seeded-статей до Фазы 2 | 🔴 Высокий | Шаг 4 устраняет немедленно — приоритет №1 |
| Фронтенд сломается если `ArticleResponse.keyword` исчезнет | 🟡 Средний | Проверить `grep -r '"keyword"' frontend/src` перед Шагом 7 |
| `GET /articles/find` меняет тип ответа `list[Article]` → `SearchResultsResponse` | 🔴 Высокий | Синхронизировать с фронтендом в одном деплое |
| `orphans_to_delete > 0` в М-1 (пользовательские статьи до рефакторинга) | 🟡 Средний | М-1 блокирует М-2 — ручной анализ обязателен |
| Миграция 0007 применена до обновления ORM-модели | 🔴 Высокий | Шаг 9 содержит оба файла в одном коммите — применять вместе |
| Advisory lock не работает после изменения `SearchService` | 🟡 Средний | Тест в Шаге 8b покрывает lock-путь |

***

## Когда выполнять ручные операции М-1…М-5

Из ТЗ следует чёткий порядок зависимостей: 

```
Шаги 4–8 (код) → e2e-прогон → М-1 + М-2 → Шаг 9 + М-4 → merge
```

Детально:

| Операция | Когда | Почему именно тогда |
|---|---|---|
| **М-3** — `alembic upgrade 0006` на Supabase | **Сейчас, немедленно** | Миграция уже в репо с коммита `977a545`. Без неё таблицы `catalog_articles` и `search_result_articles` не существуют — шаги 5–7 не будут работать даже локально |
| **М-5** — `lint-imports` | После шагов 4–8, **до merge** | Новые модули (`app/utils/`, `catalog_service`, новые репозитории) могут нарушить архитектурные границы |
| **М-1** — верификационный SELECT | После полного e2e-прогона (все тесты зелёные) | Нужно убедиться, что рабочий код не породил `is_seeded=FALSE` строк перед необратимым DELETE |
| **М-2** — перенос данных + DELETE orphans | Сразу после М-1 при `orphans_to_delete = 0` | Это необратимая операция — данные не восстанавливаются. Запускать только при уверенности в корректности кода (подтверждённой e2e) |
| **М-4** — `alembic upgrade 0007` на Supabase | После коммита шага 9 **и** после М-2 | `DROP COLUMN` на живой БД безопасен только если данных в этих колонках больше нет (М-2 это гарантирует) |

**Критическое правило:** М-1 и М-2 — **после** e2e, а не до. Если запустить перенос данных на незавершённом коде, есть риск, что новый поиск запишет статьи без `search_result_articles` (несоответствие 3 из ТЗ ещё не исправлено), и `orphans_to_delete` вырастет непредсказуемо.
