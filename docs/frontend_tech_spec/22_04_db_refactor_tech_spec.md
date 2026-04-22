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

# План реализации ТЗ: Рефакторинг хранения данных и обработки поисковых запросов

## Часть 1 — План коммитов

Коммиты сгруппированы в **6 атомарных шагов** по принципу «каждый шаг компилируется и не ломает приложение до следующего».

***

### Шаг 1 — Миграция: создание новых таблиц (Фаза 1)

**1 коммит:** `alembic/versions/0006_refactor_article_ownership.py`

Содержимое:
- `upgrade()`: создаёт `ix_articles_no_doi_unique`, таблицы `catalog_articles` и `search_result_articles` с их индексами (без `ix_sra_article_id`).
- `downgrade()`: откат — удаление этих таблиц и индексов.
- ⚠️ Колонки `keyword` и `is_seeded` в `articles` **не трогаются** — это Фаза 3.

> **Замечание:** Фаза 1 — полностью не разрушающая, приложение после неё продолжает работать в текущем состоянии.

***

### Шаг 2 — Фундамент: модели, утилита, новые интерфейсы

**1 коммит**, 7 файлов:

| Файл | Действие |
|---|---|
| `app/utils/__init__.py` | Создать (пустой) |
| `app/utils/db_utils.py` | Создать — `escape_ilike()` |
| `app/models/catalog_article.py` | Создать — ORM-модель `CatalogArticle` |
| `app/models/search_result_article.py` | Создать — ORM-модель `SearchResultArticle` |
| `app/interfaces/catalog_repository.py` | Создать — `ICatalogRepository` (без `is_article_in_catalog`) |
| `app/interfaces/search_result_repo.py` | Создать — `ISearchResultRepository` |
| `app/interfaces/article_repository.py` | Обновить — удалить `get_all/get_total_count/get_stats/get_search_stats`; переименовать `save_many→upsert_many`; расширить `get_by_id(id, user_id=None)`; добавить запрет на `commit()` в docstring |

> Приложение после этого шага **не запустится** (интерфейс изменился, реализации ещё нет). Это временное состояние — допустимо в feature-ветке. В `main` шаг идёт сразу со шагом 3.

***

### Шаг 3 — Инфраструктура: новые репозитории + переписать существующий

**1 коммит**, 4 файла:

| Файл | Действие |
|---|---|
| `app/infrastructure/postgres_catalog_repo.py` | Создать — реализует `ICatalogRepository` |
| `app/infrastructure/postgres_search_result_repo.py` | Создать — реализует `ISearchResultRepository`; атомарная авторизационная проверка одним JOIN |
| `app/infrastructure/postgres_article_repo.py` | Переписать: два батчевых `upsert_many`; расширить `get_by_id` с JOIN-логикой видимости; удалить `get_all/get_total_count/get_stats/get_search_stats` |
| `app/infrastructure/scopus_client.py` | Удалить `is_seeded=True` и `keyword=` из конструктора `Article()` |

***

### Шаг 4 — Сервисы: новые + рефакторинг существующих

**1 коммит**, 3 файла:

| Файл | Действие |
|---|---|
| `app/services/catalog_service.py` | Создать — `get_paginated`, `get_stats`, `search_in_catalog`, `seed(keyword, articles)` |
| `app/services/search_service.py` | Переписать `find_and_save`: `upsert_many` → `insert_row` → `save_results` → один `commit()`; возврат `tuple[SearchHistory, list[Article]]` |
| `app/services/article_service.py` | Сократить до `get_by_id(article_id, user_id=None)` |

***

### Шаг 5 — API: схемы, роутер, DI

**1 коммит**, 3 файла:

| Файл | Действие |
|---|---|
| `app/schemas/article_schemas.py` | Удалить `keyword` из `ArticleResponse`; добавить `SearchResultsResponse`; добавить `results_available = result_count > 0` в `SearchHistoryItemResponse` |
| `app/routers/articles.py` | Переключить зависимости на `CatalogService`; добавить `GET /history/{id}/results`; исправить `search/stats` → `ISearchResultRepository`; исправить `/{article_id}` → `ArticleService.get_by_id(id, user_id)`; сохранить advisory lock |
| `app/core/dependencies.py` | Добавить провайдеры `CatalogService`, `ISearchResultRepository`, `ISearchHistoryRepository` |

***

### Шаг 6 — Сидер + тесты

**2 коммита:**

**6a:** `db_seeder/seeder__scripts/seed_db.py`
- Переключить вызов с прямого `save_many` на `CatalogService.seed(keyword, articles)`.

**6b:** Тесты — 4 файла:

| Файл | Действие |
|---|---|
| `tests/unit/test_article_service.py` | Удалить тесты `get_all`, `get_stats`; переписать под `get_by_id(id, user_id)` |
| `tests/unit/test_search_service.py` | Переписать под новый `find_and_save` (три mock — `upsert_many`, `insert_row`, `save_results`) |
| `tests/unit/test_scopus_client.py` | Убрать проверку `is_seeded=True` |
| `tests/unit/test_catalog_service.py` | **Создать** — тесты `seed`, `get_paginated`, `get_stats` |

***

## Часть 2 — Ручные действия (не автоматизируются коммитами)

### 🔷 М-1 — Верификационный SELECT перед миграцией Фазы 2

**Когда:** после того как Шаги 1–5 закоммичены и приложение работает.

Выполнить вручную в **Supabase SQL Editor**:

```sql
-- Проверить состояние данных до переноса (результат должен показать 0 orphans)
SELECT
    COUNT(*)                                     AS total_articles,
    COUNT(*) FILTER (WHERE is_seeded = TRUE)     AS seeded_to_migrate,
    COUNT(*) FILTER (WHERE is_seeded = FALSE)    AS orphans_to_delete,
    MIN(created_at)                              AS oldest,
    MAX(created_at)                              AS newest
FROM articles;
```

**Ожидаемый результат:** `orphans_to_delete = 0`. Если `> 0` — просмотреть эти записи вручную:

```sql
SELECT id, title, keyword, created_at FROM articles WHERE is_seeded = FALSE LIMIT 20;
```

***

### 🔷 М-2 — Миграция Фаза 2: перенос данных (выполнить в Supabase SQL Editor)

**Когда:** только после `orphans_to_delete = 0` по М-1.

```sql
-- Переносим все seeded-статьи в catalog_articles
INSERT INTO catalog_articles (article_id, keyword, seeded_at)
SELECT id, keyword, created_at
FROM   articles
WHERE  is_seeded = TRUE
ON CONFLICT DO NOTHING;

-- Проверить результат переноса
SELECT COUNT(*) FROM catalog_articles;

-- Только после проверки — удалить orphan-статьи
-- ⚠️ НЕОБРАТИМО
DELETE FROM articles WHERE is_seeded = FALSE;
```

***

### 🔷 М-3 — Применить Alembic миграцию 0006 (Фаза 1) локально

**Когда:** после `git pull` шага 1.

```powershell
# В корне проекта
alembic upgrade 0006
```

Убедиться, что таблицы `catalog_articles` и `search_result_articles` появились:

```powershell
alembic current
# Должно показать: 0006 (head)
```

***

### 🔷 М-4 — Miграция Фаза 3: удалить колонки `keyword` и `is_seeded`

**Когда:** после М-2, когда перенос данных подтверждён.

Этот шаг **оформляется отдельным коммитом** `0007_drop_article_legacy_columns.py` — он добавляется в репозиторий после вашего подтверждения. После пуша:

```powershell
alembic upgrade 0007
```

И в Supabase SQL Editor (Alembic для Supabase применяется вручную):

```sql
ALTER TABLE articles DROP COLUMN IF EXISTS is_seeded;
ALTER TABLE articles DROP COLUMN IF EXISTS keyword;
```

***

### 🔷 М-5 — Обновить ORM-модель `Article` (синхронно с Фазой 3)

**Это коммит**, но требует ручного решения о моменте: модель `Article` в `app/models/article.py` (удаление `keyword` и `is_seeded`) должна попасть в репозиторий **одновременно** с миграцией 0007, не раньше — иначе приложение упадёт при запуске до применения Фазы 3 к БД.

***

### 🔷 М-6 — Проверка `.importlinter` после рефакторинга

В репозитории есть `.importlinter` с настроенными правилами граней архитектуры. После добавления новых модулей (`app/utils/`, новые интерфейсы, новые сервисы) нужно локально убедиться, что правила не нарушены:

```powershell
lint-imports
```

Если нарушения есть — добавить новые модули в разрешённые слои конфигурации `.importlinter`.

***

## Сводный порядок выполнения

```
Шаги 1–6 (коммиты)
    ↓
М-3: alembic upgrade 0006  (локально)
    ↓
М-1: верификационный SELECT  (Supabase)
    ↓
М-2: перенос данных + DELETE orphans  (Supabase)
    ↓
коммит 0007 + М-4: DROP COLUMN  (Supabase + локально)
    ↓
М-5: обновить Article ORM (коммит синхронно с 0007)
    ↓
М-6: lint-imports
```

***

Скажи, с какого шага начнём генерировать коммиты — могу сразу пушить Шаги 1 и 2 параллельно или начать с Шага 1 в изоляции для проверки.
