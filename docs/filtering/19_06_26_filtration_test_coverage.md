<img src="https://r2cdn.perplexity.ai/pplx-full-logo-primary-dark%402x.png" style="height:64px;margin-right:32px"/>

# Все хорошо, но нужно переработать и перепроверить план тестового покрытия отрефакторенной нами системы фильтрации с учетом следующих вводных:

1. Глубоко изучить уже существующие тесты проекта ([tests](https://github.com/HelgDemidov/scopus_search_code/tree/filtering/tests) и при необходимости другие папки), чтобы избежать дублирования и конфликтов между существующими и новыми тестами. Также нужно проверить существующие тесты на предмет того, не привели ли продленные нами в рамках рефакторинга системы фильтрации изменения к ошибкам в ранее написанных тестах.
2. Проверить текущую структуру папок в моем репозитории, чтобы найти оптимальное место и структуру для размещения новых тестов.
3. Изучить текущие jobs по авто-тестам Github, настроенным на коммиты в определенные ветки моего репозитория, а также на другие триггеры (папка [.github/workflows](https://github.com/HelgDemidov/scopus_search_code/tree/filtering/.github/workflows)). В том числе оценить целесообразность обновить какие-либо из существующих воркфлоу, чтобы включить в них новые тесты системы фильтрации - а также обеспечить их автоматический запуск при коммитах в ветку filtering.
4. И только после этого разработать и прислать мне окончательный уточненный план коммитов по реализации тестового покрытия системы фильтрации моего поискового сервиса.

Теперь у меня есть все данные. Провожу полный анализ — проверяю потенциальные конфликты с изменениями рефакторинга.

***

## Полная картина перед планом

### Диагностика: конфликты существующих тестов с рефакторингом фильтрации

Прочитав весь тестовый код ветки `filtering`, я нашёл **3 реальных конфликта**, которые нужно исправить до или в рамках новых тестов:

**Конфликт 1 — `test_scopus_client.py`**: тест вызывает `client.search("machine learning", count=1)` без параметра `filters`. Новая сигнатура `search()` принимает `filters: dict | None = None` — это **обратно совместимо**, тест не сломается. Но тест не проверяет `_build_query()` вообще, что создаёт ложное ощущение покрытия. **Нужно добавить** тест на `_build_query`, не менять существующий.

**Конфликт 2 — `FakeSearchClient` в `test_search_service.py`**:  метод `search()` определён как `async def search(self, keyword: str, count: int = 25) -> List[Article]` — без параметра `filters`. Теперь `SearchService.find_and_save()` вызывает `self.search_client.search(keyword=keyword, count=count, filters=filters)` и также вызывает `self.search_client._build_query(keyword, filters)`.  `FakeSearchClient` не имеет `_build_query` — **тест упадёт с `AttributeError`** при запуске.

**Конфликт 3 — `FakeCatalogRepository` в `test_catalog_service.py`**:  сигнатуры `get_all()` и `get_total_count()` принимают только `keyword` и `search`. Теперь `CatalogService.get_catalog_paginated()` должен передавать туда ещё 5 параметров (`year_from`, `year_to`, `doc_types`, `open_access`, `countries`). Тест `test_get_catalog_paginated_passes_filters` проверяет только `keyword` и `search` — **этот тест не поймает регрессию** по новым параметрам.

**Конфликт 4 — моки в `test_find_articles.py` и `test_articles_api.py`**:  `mock_search` подписан как `async def mock_search(self, keyword: str, count: int = 25)`. `SearchService.find_and_save()` теперь вызывает `self.search_client._build_query(keyword, filters)` **до** вызова `search()`.  Так как monkeypatch заменяет только метод `search`, вызов `_build_query` пойдёт в реальный `ScopusHTTPClient._build_query()` — это **сработает**, но добавляет неявную зависимость. Не критично, но нужно осознавать.

***

### Текущая структура тестов

```
tests/
├── conftest.py                     # SQLite in-memory фикстуры: db_session, client, authenticated_client
├── unit/
│   ├── test_scopus_client.py       # Юнит: HTTP-маппинг, rate-limit headers
│   ├── test_search_service.py      # Юнит: оркестрация pipeline (Fake-зависимости) ← КОНФЛИКТ 2
│   ├── test_catalog_service.py     # Юнит: пагинация, seed, stats ← КОНФЛИКТ 3
│   ├── test_search_history_repository.py  # Юнит: FakeRepo для истории
│   ├── test_article_service.py     # Юнит: ArticleService
│   └── test_user_service.py        # Юнит: UserService
└── integration/
    ├── conftest.py                 # PG-фикстуры (pg_engine, pg_session) — скипаются без DATABASE_TEST_URL
    ├── test_find_articles.py       # E2E через SQLite: auth, quota, filter persistence ← КОНФЛИКТ 4
    ├── test_find_articles_postgres.py # PG-only: advisory-lock concurrency
    ├── test_articles_api.py        # E2E через SQLite: базовый happy path ← КОНФЛИКТ 4
    ├── test_articles_headers.py    # E2E: заголовки пагинации
    ├── test_article_by_id.py       # E2E: GET /articles/{id}
    ├── test_article_by_id_e2e.py   # E2E: полный цикл find→by_id
    ├── test_search_history_api.py  # E2E: /articles/history
    ├── test_rt_e2e.py              # E2E: refresh token
    ├── test_rt_edge_cases.py       # E2E: edge cases RT
    └── test_users_api.py           # E2E: /users/*
```


***

### Анализ воркфлоу GitHub Actions

Воркфлоу `tests.yml` запускается на `push` и `pull_request` только к веткам `main` и `master`.  Ветка `filtering` **не включена** — ни один тест не запускается при коммитах в неё автоматически.

Структура джобов:


| Джоб | Триггер | БД | Маркер | Покрытие |
| :-- | :-- | :-- | :-- | :-- |
| `test` | push/PR → main/master | SQLite in-memory | `not requires_pg` | `--cov-fail-under=75` |
| `test-pg` | push/PR → main/master | PostgreSQL 16 сервис | `requires_pg` | нет порога |
| `frontend-tests.yml` | отдельный файл | — | — | Vitest |
| `e2e.yml` | отдельный файл | — | — | Playwright |
| `seeder.yml` | schedule/manual | — | — | реальный Scopus |
| `keep_alive.yml` | schedule | — | — | ping Render |

**Вывод по воркфлоу:** нужно добавить `filtering` в `branches` обоих джобов `tests.yml` — тогда каждый коммит в ветку будет запускать полный test-suite автоматически, и ты сразу увидишь конфликты из раздела выше. Это 1 строка изменения в воркфлоу.

***

## Итоговый план коммитов — тестовое покрытие фильтрации

### Коммит T-0 — `fix(ci): добавить ветку filtering в triggers tests.yml`

**Файл:** `.github/workflows/tests.yml`

Добавить `- filtering` в секцию `branches:` обоих событий `push` и `pull_request`. После этого CI начнёт запускаться на каждый коммит в ветку — и немедленно покажет конфликты ниже.

```yaml
on:
  push:
    branches:
      - main
      - master
      - filtering   # ← добавить
  pull_request:
    branches:
      - main
      - master
      - filtering   # ← добавить
```


***

### Коммит T-1 — `fix(tests): исправить FakeSearchClient и FakeCatalogRepository под новые сигнатуры`

**Файлы:** `tests/unit/test_search_service.py`, `tests/unit/test_catalog_service.py`

**В `test_search_service.py`:**

```python
# Добавить в FakeSearchClient:
def _build_query(self, keyword: str, filters: dict | None) -> str:
    # Минимальная реализация — возвращает базовый запрос
    return f"TITLE-ABS-KEY({keyword})"

async def search(self, keyword: str, count: int = 25, filters: dict | None = None) -> List[Article]:
    ...
```

Также обновить `FakeSearchHistoryRepository.insert_row()` — добавить параметр `scopus_query: str | None = None` в сигнатуру (он уже в интерфейсе).

**В `test_catalog_service.py`:**

Расширить `FakeCatalogRepository.get_all()` и `get_total_count()` пятью новыми параметрами (`year_from`, `year_to`, `doc_types`, `open_access`, `countries`) и сохранять их в `get_all_calls` для возможности проверки.

***

### Коммит T-2 — `test(unit): _build_query — CQL-построитель всех комбинаций фильтров`

**Файл:** `tests/unit/test_scopus_client.py` (расширение)

Добавить новый класс тестов ниже существующего теста — не менять, а дополнять:

```python
# Тест 1: без фильтров → только базовая клауза
def test_build_query_no_filters_returns_base():
    client = ScopusHTTPClient.__new__(ScopusHTTPClient)
    assert client._build_query("AI", None) == "TITLE-ABS-KEY(AI)"

# Тест 2: год_от → PUBYEAR > N-1
def test_build_query_year_from_only():
    client = ScopusHTTPClient.__new__(ScopusHTTPClient)
    q = client._build_query("AI", {"year_from": 2020})
    assert "PUBYEAR > 2019" in q

# Тест 3: год_до → PUBYEAR < N+1
def test_build_query_year_to_only():
    client = ScopusHTTPClient.__new__(ScopusHTTPClient)
    q = client._build_query("AI", {"year_to": 2024})
    assert "PUBYEAR < 2025" in q

# Тест 4: один тип документа → DOCTYPE(ar)
def test_build_query_single_doc_type():
    client = ScopusHTTPClient.__new__(ScopusHTTPClient)
    q = client._build_query("AI", {"document_types": ["Article"]})
    assert "DOCTYPE(ar)" in q

# Тест 5: несколько типов → DOCTYPE(ar) OR DOCTYPE(re)
def test_build_query_multiple_doc_types():
    client = ScopusHTTPClient.__new__(ScopusHTTPClient)
    q = client._build_query("AI", {"document_types": ["Article", "Review"]})
    assert "DOCTYPE(ar)" in q
    assert "DOCTYPE(re)" in q
    assert " OR " in q

# Тест 6: неизвестный тип — не попадает в запрос, не ломает билд
def test_build_query_unknown_doc_type_skipped():
    client = ScopusHTTPClient.__new__(ScopusHTTPClient)
    q = client._build_query("AI", {"document_types": ["UnknownType"]})
    assert "DOCTYPE" not in q

# Тест 7: open_access=True → OA(1)
def test_build_query_open_access():
    client = ScopusHTTPClient.__new__(ScopusHTTPClient)
    q = client._build_query("AI", {"open_access": True})
    assert "OA(1)" in q

# Тест 8: open_access=False → OA(1) отсутствует
def test_build_query_open_access_false_no_clause():
    client = ScopusHTTPClient.__new__(ScopusHTTPClient)
    q = client._build_query("AI", {"open_access": False})
    assert "OA(1)" not in q

# Тест 9: одна страна → AFFILCOUNTRY(Germany)
def test_build_query_single_country():
    client = ScopusHTTPClient.__new__(ScopusHTTPClient)
    q = client._build_query("AI", {"countries": ["Germany"]})
    assert "AFFILCOUNTRY(Germany)" in q

# Тест 10: несколько стран → OR между ними
def test_build_query_multiple_countries():
    client = ScopusHTTPClient.__new__(ScopusHTTPClient)
    q = client._build_query("AI", {"countries": ["Germany", "France"]})
    assert "AFFILCOUNTRY(Germany)" in q
    assert "AFFILCOUNTRY(France)" in q
    assert " OR " in q

# Тест 11: все фильтры вместе → все клаузы связаны через AND
def test_build_query_all_filters_combined():
    client = ScopusHTTPClient.__new__(ScopusHTTPClient)
    q = client._build_query("AI", {
        "year_from": 2020, "year_to": 2024,
        "document_types": ["Article"], "open_access": True,
        "countries": ["USA"],
    })
    parts = q.split(" AND ")
    assert len(parts) == 5  # base + year_from + year_to + DOCTYPE + OA + AFFILCOUNTRY = 6 → с OR внутри типов = 5 AND
    assert parts[0] == "TITLE-ABS-KEY(AI)"
```

Итог T-2: **11 новых тестов**, все чисто юнитовые, без БД, без фикстур, без asyncio — запускаются мгновенно.

***

### Коммит T-3 — `test(unit): catalog service — новые параметры фильтрации`

**Файл:** `tests/unit/test_catalog_service.py` (расширение)

Добавить тесты **после** существующих — они проверяют, что `CatalogService.get_catalog_paginated()` корректно проксирует новые 5 параметров в репозиторий:

```python
# Тест 1: новые фильтры передаются в catalog_repo.get_all()
async def test_get_catalog_paginated_passes_new_filter_params():
    svc, _, cr, _ = _mk_service(articles=[], total=0)
    await svc.get_catalog_paginated(
        page=1, size=10,
        year_from=2020, year_to=2024,
        doc_types=["Article", "Review"],
        open_access=True,
        countries=["Germany"],
    )
    call = cr.get_all_calls[0]
    assert call["year_from"] == 2020
    assert call["year_to"] == 2024
    assert call["doc_types"] == ["Article", "Review"]
    assert call["open_access"] is True
    assert call["countries"] == ["Germany"]

# Тест 2: None-фильтры не теряются (передаются как None, не как пустые списки)
async def test_get_catalog_paginated_none_filters_passed_through():
    svc, _, cr, _ = _mk_service(articles=[], total=0)
    await svc.get_catalog_paginated(page=1, size=10)
    call = cr.get_all_calls[0]
    assert call["year_from"] is None
    assert call["doc_types"] is None
    assert call["countries"] is None

# Тест 3: get_total_count получает те же фильтры — консистентность пагинации
async def test_get_catalog_paginated_total_count_gets_same_filters():
    svc, _, cr, _ = _mk_service(articles=[], total=5)
    await svc.get_catalog_paginated(
        page=1, size=10, year_from=2022, open_access=False
    )
    # Проверяем оба вызова — get_all и get_total_count должны получить одинаковые фильтры
    count_call = cr.get_total_count_calls[0]
    get_all_call = cr.get_all_calls[0]
    assert count_call["year_from"] == get_all_call["year_from"]
    assert count_call["open_access"] == get_all_call["open_access"]
```

Итог T-3: **3 новых теста**, чисто юнитовые.

***

### Коммит T-4 — `test(unit): search service — filters и scopus_query в pipeline`

**Файл:** `tests/unit/test_search_service.py` (расширение)

Добавить тесты после существующих — они проверяют новое поведение `SearchService.find_and_save()`:

```python
# Тест 1: filters передаются в search_client.search()
async def test_find_and_save_passes_filters_to_search_client():
    svc, sc, _, _, _, _ = _mk_service(articles=[_mk_article()])
    await svc.find_and_save("AI", user_id=1, filters={"year_from": 2022})
    assert sc.last_filters == {"year_from": 2022}
    # (FakeSearchClient нужно обновить для записи last_filters в T-1)

# Тест 2: scopus_query строится через _build_query и передаётся в insert_row
async def test_find_and_save_scopus_query_stored_in_history():
    svc, _, _, hr, _, _ = _mk_service(articles=[_mk_article()])
    await svc.find_and_save("ML", user_id=1, filters={"open_access": True})
    call = hr.insert_calls[0]
    assert call["scopus_query"] is not None
    assert "TITLE-ABS-KEY(ML)" in call["scopus_query"]
    assert "OA(1)" in call["scopus_query"]

# Тест 3: пустые фильтры {} ≡ None — scopus_query содержит только базовую клаузу
async def test_find_and_save_empty_filters_dict_no_extra_clauses():
    svc, _, _, hr, _, _ = _mk_service(articles=[_mk_article()])
    await svc.find_and_save("AI", user_id=1, filters={})
    call = hr.insert_calls[0]
    # {} не должен добавлять клаузы в CQL
    assert call["scopus_query"] == "TITLE-ABS-KEY(AI)"
```

Итог T-4: **3 новых теста**, чисто юнитовые.

***

### Коммит T-5 — `test(integration): GET /articles/ — серверная фильтрация через HTTP`

**Файл:** `tests/integration/test_articles_api.py` (расширение)

Добавить тесты **в конец файла** — используют существующие фикстуры `authenticated_client` и `db_session`:

```python
# Тест 1: year_from фильтрует по нижней границе года
async def test_articles_filter_year_from(authenticated_client, db_session, ...):
    # Сидируем 2 статьи: 2020 и 2023
    # GET /articles/?year_from=2022
    # Ожидаем только статью 2023

# Тест 2: doc_types как список → только совпадающие типы
async def test_articles_filter_doc_types(authenticated_client, db_session, ...):
    # Сидируем Article и Review
    # GET /articles/?doc_types=Article
    # Ожидаем только Article

# Тест 3: open_access=true → только OA-статьи
async def test_articles_filter_open_access(authenticated_client, db_session, ...):
    # Сидируем OA=True и OA=False
    # GET /articles/?open_access=true
    # Ожидаем только OA

# Тест 4: countries как список → только статьи из этих стран
async def test_articles_filter_countries(authenticated_client, db_session, ...):
    # Сидируем Germany и France
    # GET /articles/?countries=Germany
    # Ожидаем только Germany

# Тест 5: комбинация year_from + open_access (AND-логика)
async def test_articles_filter_combined(authenticated_client, db_session, ...):
    # year_from=2022 AND open_access=true
    # Из 4 статей проходит только 1

# Тест 6: фильтры не влияют на total без фильтрации
async def test_articles_filter_total_reflects_filtered_count(authenticated_client, db_session, ...):
    # total в ответе = количество статей, прошедших фильтр
```

**Почему в `test_articles_api.py`, а не в новом файле:** файл уже тестирует `/articles/` через SQLite+`authenticated_client` — добавление тестов туда избегает дублирования фикстур и хелперов.

Итог T-5: **6 новых тестов**, E2E через SQLite, используют существующую инфраструктуру.

***

### Итоговая таблица

| Коммит | Файл(ы) | Тип изменения | Новых тестов | Устраняет конфликт |
| :-- | :-- | :-- | :-- | :-- |
| T-0 | `tests.yml` | CI конфиг | — | Включает автозапуск на `filtering` |
| T-1 | `test_search_service.py`, `test_catalog_service.py` | Fix существующих Fake-классов | — | Конфликты 2, 3 |
| T-2 | `test_scopus_client.py` | Новые юниты `_build_query` | 11 | Конфликт 1 |
| T-3 | `test_catalog_service.py` | Новые юниты фильтров сервиса | 3 | — |
| T-4 | `test_search_service.py` | Новые юниты `scopus_query` | 3 | — |
| T-5 | `test_articles_api.py` | Новые E2E фильтры `/articles/` | 6 | Конфликт 4 (косвенно) |
| **Итого** |  |  | **23 теста** | 4 конфликта устранены |

**Самый важный коммит для запуска первым — T-1**: без него существующий `test_search_service.py` падает с `AttributeError` на вызове `_build_query` из `SearchService`.  Остальные можно делать в любом порядке.

