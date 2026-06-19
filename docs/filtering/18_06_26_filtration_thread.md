## Критические наблюдения по кодовой базе перед ТЗ

Прежде чем перейти к самому ТЗ — несколько важных находок, которые прямо влияют на план и риски регрессии:

**1. `ArticleFilters.tsx` уже содержит `<Checkbox>`, НО использует `<Switch>` для Open Access.**  Оба компонента (`Checkbox`, `Switch`) уже импортированы. Это значит: никакой установки новых npm-пакетов не нужно. Switch → Checkbox — замена в 3 строках JSX с сохранением логики `setFilters({ openAccessOnly: checked || undefined })`.

**2. `applyClientFilters()` в `articleStore.ts` уже полностью реализована**  и применяется внутри `fetchArticles()` после каждого запроса к серверу. Это архитектурная ловушка: если просто добавить серверные фильтры к `getArticles()`, `applyClientFilters()` будет применяться поверх уже отфильтрованных серверных данных — результат будет корректным, но двойное фильтрование остаётся избыточным. Полное удаление `applyClientFilters()` в Коммите 6 устраняет этот риск.

**3. `searchScopusLive()` НЕ передаёт фильтры в `findArticles()`**  — вызов `findArticles(keyword, 25)` принимает только 2 аргумента.  При этом роутер `/articles/find` уже принимает все 5 параметров фильтрации.  Это означает: для Scopus-режима фильтрация работает **только клиентски** через `applyClientFilters()`. После Коммита 6 (удаление `applyClientFilters`) без одновременного Коммита 5 (добавление фильтров в `findArticles`) — Scopus-режим **потеряет фильтрацию полностью**. Коммиты 5 и 6 строго зависимы и должны выполняться вместе.

**4. Роутер `/articles/` не имеет серверных параметров фильтрации**  — только `keyword`, `search`, `page`, `size`. `ICatalogRepository.get_all()` также только с `keyword` и `search`.  Поэтому каталожная цепочка (Коммит 3) требует изменений в 4 файлах бэкенда.

**5. Последняя миграция — `0007`** . Следующая будет `0008_add_filter_indexes.py`.

**6. `historyStore.setHistoryFilters()` НЕ триггерит `fetchArticles()`**  — после смены фильтра в `ArticleFilters.tsx` перезагрузка каталога не происходит. Это существующее поведение сохраняется: серверные фильтры каталога будут применяться только при явном запросе (поиск, смена страницы). Это нужно задокументировать в ТЗ как осознанное архитектурное решение, а не баг.

***

## Финальное техническое задание: рефакторинг модуля фильтрации

### 1. Цель и контекст

Текущее состояние: все фильтры (`yearFrom`, `yearTo`, `docTypes`, `openAccessOnly`, `countries`) работают **клиентски** — применяются в браузере к уже загруженной странице через `applyClientFilters()` в `articleStore`.  Это означает: фильтрация работает только в пределах одной страницы пагинации, итоговый `total` не отражает отфильтрованное количество статей, пагинация сломана при активных фильтрах.

**Цель рефакторинга:** перевести фильтры `docTypes`, `openAccessOnly`, `countries` на серверную сторону для обоих режимов (каталог + Scopus). Фильтр по году (`yearFrom`/`yearTo`) также переводится на сервер для каталога; для Scopus — встраивается в CQL-запрос. Удалить `applyClientFilters()` из `articleStore` после перевода.

**Не входит в объём:** фильтр по году в Scopus-режиме реализован через изменение CQL-запроса (`PUBYEAR > X AND PUBYEAR < Y`), а не через post-processing.

***

### 2. Функциональные требования

#### 2.1 Scopus-режим (`searchScopusLive`)

| Параметр фильтра | Scopus CQL-оператор | Пример |
| :-- | :-- | :-- |
| `yearFrom` / `yearTo` | `PUBYEAR > X AND PUBYEAR < Y` | `PUBYEAR > 2020` |
| `docTypes` (массив) | `DOCTYPE(ar) OR DOCTYPE(re)` | `ar` = Article, `re` = Review и т.д. |
| `openAccessOnly` | `OA(1)` | — |
| `countries` (массив) | `AFFILCOUNTRY(russia) OR AFFILCOUNTRY(china)` | — |

CQL формируется функцией `_build_query(keyword, filters)` в `ScopusHTTPClient`.

Маппинг `subtypeDescription` → Scopus DOCTYPE-код (нужен для CQL):

- `Article` → `ar`, `Review` → `re`, `Conference Paper` → `cp`, `Book Chapter` → `ch`, `Letter` → `le`, `Note` → `no`, `Editorial` → `ed`, `Short Survey` → `sh`


#### 2.2 Каталожный режим (`GET /articles/`)

Новые Query-параметры на эндпоинте `/articles/`:


| Параметр | Тип | SQL-оператор |
| :-- | :-- | :-- |
| `year_from` | `int \| None` | `EXTRACT(year FROM publication_date) >= year_from` |
| `year_to` | `int \| None` | `EXTRACT(year FROM publication_date) <= year_to` |
| `doc_types` | `list[str] \| None` | `document_type IN (...)` |
| `open_access` | `bool \| None` | `open_access = true` |
| `countries` | `list[str] \| None` | `affiliation_country IN (...)` |

#### 2.3 UI (ArticleFilters.tsx)

```
- `<Switch>` (Open Access) → `<Checkbox>` — единообразие всего блока фильтров
```

```
- `<details>`/`<summary>` вокруг секции Document types — аккордеон без новых зависимостей (нативный HTML)
```

```
- Predictive country input: заменить `<Popover>` + `<Command>` на `<input>` + выпадающий `<ul>` с `filter()` по `countries` из `useStatsStore`. Логика `toggleCountry()` не меняется.
```


#### 2.4 Архитектурное решение: триггер перезагрузки каталога

**Осознанное решение:** `setHistoryFilters()` не вызывает `fetchArticles()` автоматически.  Это сохраняется. Серверные фильтры каталога применяются при следующем явном запросе. Альтернатива (добавить `fetchArticles()` в `setHistoryFilters`) потребует циклической зависимости между `historyStore` и `articleStore` и выходит за объём данного рефакторинга.

***

### 3. Нефункциональные требования

```
- Без новых npm-зависимостей — `<Checkbox>`, `<Switch>`, `<Popover>`, `<Command>` уже установлены 
```

- Без новых Python-пакетов
- Alembic-миграция только для индексов (без схемных изменений — все колонки уже существуют)
- Обратная совместимость: все существующие вызовы `GET /articles/` без новых параметров работают идентично текущему поведению

***

### 4. Риски регрессии и меры их нивелирования

| Риск | Источник | Мера |
| :-- | :-- | :-- |
| **Scopus-режим теряет фильтрацию** после удаления `applyClientFilters` | Коммит 6 без Коммита 5 | Коммиты 5+6 выполняются в одной рабочей сессии без промежуточного пуша |
| **Двойная фильтрация** в каталоге (серверная + клиентская) | Коммит 3 без Коммита 6 | `applyClientFilters` удаляется в Коммите 6 одновременно с обновлением `fetchArticles` |
| **Неправильный `total`** в каталоге при активных фильтрах | `get_total_count` не получает новые параметры | В Коммите 3 оба метода `get_all` и `get_total_count` обновляются через общий хелпер `_build_filter_clauses()` |
| **Поломка пагинации** каталога при фильтрах | Клиентский `total` не совпадает с серверным после фильтрации | Решается Коммитом 3 — серверный `total` учитывает фильтры |
| **Пустые результаты Scopus** при некорректном CQL | Неверный маппинг DOCTYPE | В `_build_query` применяется `.get()` с fallback: неизвестный тип просто исключается, запрос не падает |
| **Сломанные тесты** на `ScopusHTTPClient` | Новая сигнатура `search(keyword, count, filters)` | `filters=None` — дефолт, все существующие вызовы не ломаются |
| **Гонка состояний** в `fetchArticles` при смене фильтра | `applyClientFilters` читает `historyStore` через динамический `import()` | После удаления `applyClientFilters` гонка устраняется |
| **Сломанный `ArticleFilters.tsx`** при замене country input | Popover/Command имеют специфический обработчик `onSelect` | `toggleCountry()` не меняется, только обёртка UI; `countriesOpen` state удаляется вместе с Popover |


***

### 5. Файлы изменений

#### Бэкенд

| Файл | Тип изменения | Объём |
| :-- | :-- | :-- |
| `app/interfaces/search_client.py` | Добавить `filters: dict \| None = None` в `search()` | +1 строка |
| `app/infrastructure/scopus_client.py` | Добавить `_build_query()` + `_DTYPE_MAP`, обновить `search()` | +45 строк |
| `app/interfaces/catalog_repository.py` | Добавить 5 параметров в `get_all()` и `get_total_count()` | +10 строк |
| `app/infrastructure/postgres_catalog_repo.py` | Добавить `_build_filter_clauses()`, обновить оба метода | +35 строк |
| `app/services/catalog_service.py` | Проксировать 5 новых параметров через `get_catalog_paginated()` | +10 строк |
| `app/routers/articles.py` | Добавить 5 `Query`-параметров в `get_articles()` | +10 строк |
| `alembic/versions/0008_add_filter_indexes.py` | Новый файл: 3 индекса | ~30 строк |

#### Фронтенд

| Файл | Тип изменения | Объём |
| :-- | :-- | :-- |
| `frontend/src/api/articles.ts` | Расширить `GetArticlesParams` + `getArticles()` + `findArticles()` | +25 строк |
| `frontend/src/stores/articleStore.ts` | Обновить `fetchArticles()`, `searchScopusLive()`, удалить `applyClientFilters()` | -47 строк / +15 строк |
| `frontend/src/components/articles/ArticleFilters.tsx` | Switch→Checkbox, аккордеон doc types, predictive country input | ~40 строк замены |


***

### 6. Детализация ключевых реализаций

#### `_build_query()` в `ScopusHTTPClient`

```python
# Маппинг subtypeDescription → Scopus DOCTYPE-код для CQL
_DTYPE_MAP = {
    "Article": "ar", "Review": "re", "Conference Paper": "cp",
    "Book Chapter": "ch", "Letter": "le", "Note": "no",
    "Editorial": "ed", "Short Survey": "sh",
}

def _build_query(self, keyword: str, filters: dict | None) -> str:
    # Базовый запрос — всегда присутствует
    parts = [f"TITLE-ABS-KEY({keyword})"]
    if not filters:
        return parts[0]
    # Фильтр по году — два независимых условия
    if yf := filters.get("year_from"):
        parts.append(f"PUBYEAR > {yf - 1}")
    if yt := filters.get("year_to"):
        parts.append(f"PUBYEAR < {yt + 1}")
    # Фильтр по типу документа — OR внутри AND
    if doc_types := filters.get("doc_types"):
        codes = [_DTYPE_MAP[d] for d in doc_types if d in _DTYPE_MAP]
        if codes:
            parts.append("(" + " OR ".join(f"DOCTYPE({c})" for c in codes) + ")")
    # Только Open Access
    if filters.get("open_access"):
        parts.append("OA(1)")
    # Фильтр по странам — OR внутри AND
    if countries := filters.get("country"):
        parts.append("(" + " OR ".join(f"AFFILCOUNTRY({c.lower()})" for c in countries) + ")")
    return " AND ".join(parts)
```


#### `_build_filter_clauses()` в `PostgresCatalogRepository`

```python
def _build_filter_clauses(self, stmt, filters: dict | None):
    # Применяет общие WHERE-клаузы для get_all и get_total_count
    if not filters:
        return stmt
    if yf := filters.get("year_from"):
        stmt = stmt.where(
            sa.extract("year", Article.publication_date) >= yf
        )
    if yt := filters.get("year_to"):
        stmt = stmt.where(
            sa.extract("year", Article.publication_date) <= yt
        )
    if doc_types := filters.get("doc_types"):
        stmt = stmt.where(Article.document_type.in_(doc_types))
    if filters.get("open_access") is True:
        stmt = stmt.where(Article.open_access.is_(True))
    if countries := filters.get("countries"):
        stmt = stmt.where(Article.affiliation_country.in_(countries))
    return stmt
```


#### Расширение `GetArticlesParams` + `getArticles()` в `articles.ts`

```typescript
export interface GetArticlesParams {
  page?: number;
  size?: number;
  keyword?: string;
  search?: string;
  signal?: AbortSignal;
  // Серверные фильтры каталога
  year_from?: number;
  year_to?: number;
  doc_types?: string[];
  open_access?: boolean;
  countries?: string[];
}

// В getArticles():
if (year_from)  params.append('year_from', String(year_from));
if (year_to)    params.append('year_to', String(year_to));
doc_types?.forEach(t => params.append('doc_types', t));
if (open_access !== undefined) params.append('open_access', String(open_access));
countries?.forEach(c => params.append('countries', c));
```


#### Обновление `fetchArticles()` в `articleStore.ts`

```typescript
fetchArticles: async (keyword?: string) => {
    const { page, size, filters } = get();
    const effectiveKeyword = keyword !== undefined ? keyword : filters.keyword;
    set({ isLoading: true, error: null });
    try {
      // Читаем client-side фильтры (теперь они же будут серверными)
      const { useHistoryStore } = await import('./historyStore');
      const { historyFilters } = useHistoryStore.getState();

      const data = await getArticles({
        page, size,
        keyword: effectiveKeyword,
        search: filters.search,
        // Передаем фильтры на сервер напрямую
        year_from: historyFilters.yearFrom,
        year_to: historyFilters.yearTo,
        doc_types: historyFilters.docTypes,
        open_access: historyFilters.openAccessOnly,
        countries: historyFilters.countries,
      });
      // applyClientFilters() удалена — фильтрация полностью на сервере
      const { appendMode, articles: prev, page: currentPage } = get();
      set({
        articles: appendMode && currentPage > 1 ? [...prev, ...data.articles] : data.articles,
        total: data.total,
        isLoading: false,
      });
    } catch (err) { /* ... без изменений ... */ }
  },
```


***

### 7. Alembic-миграция `0008`

```python
# alembic/versions/0008_add_filter_indexes.py
def upgrade() -> None:
    # Индекс на document_type — поддержка IN-фильтра
    op.create_index("ix_articles_document_type", "articles", ["document_type"])
    # Индекс на affiliation_country — поддержка IN-фильтра
    op.create_index("ix_articles_affiliation_country", "articles", ["affiliation_country"])
    # Partial-индекс на open_access=true — только нужные строки
    op.create_index(
        "ix_articles_open_access_true", "articles", ["open_access"],
        postgresql_where=sa.text("open_access = true")
    )

def downgrade() -> None:
    op.drop_index("ix_articles_open_access_true", "articles")
    op.drop_index("ix_articles_affiliation_country", "articles")
    op.drop_index("ix_articles_document_type", "articles")
```


***

### 8. План коммитов (7 коммитов)

#### Коммит 1 — `feat(scopus): add filters support to ISearchClient + ScopusHTTPClient`

**Ветка:** `filtering`
**Файлы:** `app/interfaces/search_client.py`, `app/infrastructure/scopus_client.py`
**Что:** добавить `filters: dict | None = None` в абстрактный `search()` ; добавить `_DTYPE_MAP` и `_build_query(keyword, filters)` в `ScopusHTTPClient` ; обновить `params["query"]` — использовать `self._build_query(keyword, filters)` вместо f-строки.
**Риск:** нет — `filters=None` по умолчанию, старые вызовы не ломаются.

#### Коммит 2 — `feat(search): pass filters through SearchService → ScopusHTTPClient`

**Файл:** `app/services/search_service.py`
**Что:** в `search_client.search(keyword=keyword, count=count)` добавить `filters=filters`.
**Риск:** нет — `filters` уже приходит в `find_and_save()` из роутера , просто не пробрасывался дальше.

#### Коммит 3 — `feat(catalog): server-side filters in repo + service + router`

**Файлы:** `app/interfaces/catalog_repository.py`, `app/infrastructure/postgres_catalog_repo.py`, `app/services/catalog_service.py`, `app/routers/articles.py`
**Что:** добавить `_build_filter_clauses()` в `PostgresCatalogRepository`, обновить `get_all()` и `get_total_count()` ; добавить 5 параметров в интерфейс `ICatalogRepository` ; проксировать через `CatalogService.get_catalog_paginated()` ; добавить 5 `Query`-параметров в `GET /articles/` в роутере .
**Риск:** все новые параметры имеют `= None` как дефолт → существующие вызовы без фильтров работают идентично.

#### Коммит 4 — `feat(db): add indexes for filter columns`

**Файл:** `alembic/versions/0008_add_filter_indexes.py`
**Что:** 3 индекса на `document_type`, `affiliation_country`, `open_access` (partial).
**Риск:** только performance-изменение, `downgrade` написан.

#### Коммит 5+6 — `feat(api, store): server-side filters in frontend` *(строго один коммит)*

**Файлы:** `frontend/src/api/articles.ts`, `frontend/src/stores/articleStore.ts`
**Что:** расширить `GetArticlesParams` + `getArticles()` + `findArticles()` ; в `fetchArticles()` передавать `historyFilters` как серверные параметры + удалить `applyClientFilters()` ; в `searchScopusLive()` передавать `historyFilters` в `findArticles()`.
**Почему один коммит:** если удалить `applyClientFilters()` до обновления `findArticles()` — Scopus-режим теряет фильтрацию. Оба изменения неразделимы.
**Риск после:** пагинация каталога с фильтрами начнёт работать корректно — `total` теперь учитывает фильтры.

#### Коммит 7 — `feat(ui): filter UX — OA checkbox, doc type accordion, predictive country input`

**Файл:** `frontend/src/components/articles/ArticleFilters.tsx`

```
**Что:** `<Switch>` → `<Checkbox>` для Open Access ; `<details>`/`<summary>` вокруг секции Document types; заменить `<Popover>` + `<Command>` на `<input>` + `<ul>` для стран — удалить `countriesOpen` state .
```

```
**Риск:** минимальный — `toggleCountry()` и `setFilters()` не меняются; только обёртка UI. `<Checkbox>` и `<Switch>` уже установлены в shadcn/ui.
```


***

### Итог

|  | Оригинальный план | Финальный план |
| :-- | :-- | :-- |
| Коммитов | 21 | **7** |
| Файлов бэкенда | 9 | 8 |
| Файлов фронтенда | 7 | 3 |
| Новых npm-пакетов | 0 | 0 |
| Новых Python-пакетов | 0 | 0 |
| Миграций | 2 | 1 (только индексы) |

