# Техническое Задание: Рефакторинг модуля фильтрации — Scopus API Search

**Версия:** 1.0 | **Дата:** 30.04.2026 | **Ветка:** `filtration`

***

## 1. Обзор и цели

### 1.1 Контекст задачи

Текущая реализация фильтрации в сервисе "Scopus API Search" полностью клиентская: фильтры применяются функцией `applyClientFilters()` к уже загруженной странице данных [VERIFIED: `articleStore.ts`, строки 47–73]. Это создаёт два критических дефекта:

1. **Scopus Live Mode:** параметры `year_from`, `year_to`, `doc_types`, `open_access`, `country` уже принимаются роутером `GET /articles/find` и передаются в `SearchService.find_and_save(filters=...)`, но `SearchService` их не использует при вызове `search_client.search()` — в Scopus уходит голый запрос `TITLE-ABS-KEY({keyword})` без CQL-фильтров. Из-за жёсткого лимита API в 25 результатов post-hoc фильтрация сокращает выдачу до непредсказуемо малого числа статей [VERIFIED: `scopus_client.py`, строка 64; `search_service.py`, строка 50].

2. **Catalog Mode:** `GET /articles/` принимает только `page`, `size`, `keyword`, `search` [VERIFIED: `articles.py`, строки 57–71] — фильтры по году, типу, стране, open access в SQL-запрос каталога не попадают. `ICatalogRepository.get_all()` не имеет соответствующих параметров [VERIFIED: `catalog_repository.py`].

### 1.2 Цели рефакторинга

| # | Цель | Измеримый результат |
|---|---|---|
| Г-1 | Scopus live: фильтры реализуются превентивно через CQL | Scopus API получает запрос с CQL-операторами `PUBYEAR`, `DOCTYPE`, `OA`, `AFFILCOUNTRY` |
| Г-2 | Catalog: фильтры применяются на сервере через SQL WHERE | Бэкенд принимает и применяет все 5 параметров фильтрации |
| Г-3 | Убрать `applyClientFilters()` — вся фильтрация серверная | Функция удалена из `articleStore.ts` |
| Г-4 | Унифицировать UI фильтров: аккордеон, checkbox OA, predictive input для стран | Компоненты соответствуют UX-спецификации §4 |
| Г-5 | Поднять монтирование фильтров из `ArticleList` в `HomePage` | Смена фильтра вызывает re-fetch на уровне страницы |
| Г-6 | Сохранять итоговый CQL-запрос в `search_history.filters` | Поле `scopus_query` доступно на фронтенде |

***

## 2. Верифицированное состояние AS-IS

> Все факты в этом разделе получены прямым чтением кода ветки `main`. Помечены [VERIFIED].

### 2.1 Backend fact-sheet

**Сигнатура `ISearchClient.search()`** [VERIFIED: `app/interfaces/search_client.py`]:
```python
@abstractmethod
async def search(self, keyword: str, count: int = 25) -> List[Article]:
    ...
```
*Параметра `filters` нет — контракт принимает только ключевое слово и количество.*

**Сигнатура `SearchService.find_and_save()`** [VERIFIED: `app/services/search_service.py`]:
```python
async def find_and_save(
    self,
    keyword: str,
    count: int = 25,
    *,
    user_id: int,
    filters: dict | None = None,
) -> List[Article]:
```
*`filters` принимается, но в строке 50 передаётся в `history_repo.insert_row()` для аналитики, а не в `search_client.search()`.*

**`GET /articles/find` — query params** [VERIFIED: `app/routers/articles.py`]:
```
keyword: str (обязателен, min_length=2)
count: int (1..25, default=25)
year_from: int | None
year_to: int | None
doc_types: list[str] | None
open_access: bool | None
country: list[str] | None
```
*Параметры уже принимаются и упаковываются в `filters_payload` dict, который передаётся в `find_and_save(filters=...)`. Проброс в Scopus отсутствует.*

**`GET /articles/` — query params** [VERIFIED: `app/routers/articles.py`]:
```
page: int (≥1, default=1)
size: int (1..100, default=10)
keyword: str | None (min_length=2)
search: str | None (min_length=2)
```
*Параметры фильтрации (год, тип, страна, OA) отсутствуют.*

**`ICatalogRepository.get_all()` сигнатура** [VERIFIED: `app/interfaces/catalog_repository.py`]:
```python
async def get_all(
    self, limit: int, offset: int,
    keyword: str | None = None,
    search: str | None = None,
) -> List[Article]:
```
*Параметров фильтрации нет.*

**`SearchHistory` model** [VERIFIED: `app/models/search_history.py`]:
```
id, user_id, query, created_at, result_count, filters (JsonField/JSONB)
```
*Поля `scopus_query` нет.*

**`SearchHistoryItemResponse` schema** [VERIFIED: `app/schemas/search_history_schemas.py`]:
```
id, query, created_at, result_count, filters: dict, results_available (computed)
```
*`scopus_query` не экспонируется.*

### 2.2 Frontend fact-sheet

**`ArticleClientFilters` type** [VERIFIED: `frontend/src/types/api.ts`]:
```typescript
interface ArticleClientFilters {
  yearFrom?: number;
  yearTo?: number;
  docTypes?: string[];
  openAccessOnly?: boolean;
  countries?: string[];
}
```

**Где живёт filter state** [VERIFIED: `historyStore.ts`]:
`useHistoryStore` → поле `historyFilters: HistoryFilters` (алиас `ArticleClientFilters`). Экшен `setHistoryFilters(filters: Partial<HistoryFilters>)`.

**Где живут `liveResults`** [VERIFIED: `articleStore.ts`]:
`useArticleStore` → поле `liveResults: ArticleResponse[]`.

**Монтирование `ArticleFiltersSidebar` / `ArticleFiltersMobile`** [VERIFIED: `ArticleList.tsx`]:
Оба компонента импортируются и рендерятся **внутри** `ArticleList.tsx` — в loading-skeleton, empty state и нормальном рендере. `HomePage.tsx` не импортирует фильтр-компоненты напрямую.

**Как `statsStore` заполняет опции фильтров** [VERIFIED: `ArticleFilters.tsx`, `statsStore.ts`]:
`FiltersContent` читает `useStatsStore((s) => s.stats)`. Из `stats.by_doc_type`, `stats.by_country`, `stats.by_year` извлекаются `docTypes`, `countries`, `years` — данные статистики **каталога** (`GET /articles/stats`), а не реальных Scopus-результатов.

**Текущие search modes** [VERIFIED: `HomePage.tsx`, строка 75]:
```typescript
const [searchMode, setSearchMode] = useState<'scopus' | 'catalog'>('scopus');
```

**`findArticles()` в `api/articles.ts`** [VERIFIED]:
```typescript
export async function findArticles(keyword: string, count: number = 25): Promise<FindArticlesResult>
```
Отправляет только `{ keyword, count }` — фильтры не сериализуются.

**`searchScopusLive()` в `articleStore.ts`** [VERIFIED: строка 135]:
```typescript
const { articles, quota } = await findArticles(keyword, 25);
```
Фильтры из `historyStore.historyFilters` не читаются и не передаются.

**`fetchArticles()` в `articleStore.ts`** [VERIFIED: строки 65–93]:
Вызывает `getArticles({page, size, keyword, search})`, затем постфактум вызывает `applyClientFilters(data.articles, historyFilters)`. Фильтры **не попадают** в HTTP-запрос.

***

## 3. Целевая архитектура

### 3.1 Scopus Live Mode — превентивная серверная фильтрация

#### Слой 1 — `app/interfaces/search_client.py`

**Изменение:** добавить параметр `filters` в абстрактный метод.

```python
from typing import List, Optional

class ISearchClient(ABC):

    @abstractmethod
    async def search(
        self,
        keyword: str,
        count: int = 25,
        filters: Optional[dict] = None,   # новый параметр
    ) -> List[Article]:
        """
        filters: словарь с опциональными ключами:
          year_from: int
          year_to: int
          doc_types: list[str]   — human-readable метки ("Article", "Review", ...)
          open_access: bool
          country: list[str]
        """
        pass
```

*Изменение backward-compatible: существующий код, не передающий `filters`, продолжает работать через `filters=None`.*

#### Слой 2 — `app/infrastructure/scopus_client.py`

**Изменение 2а:** добавить приватный метод `_build_query()`.

**Таблица маппинга DOCTYPE** (human-readable → Scopus code):

| Метка в UI | Scopus-код | CQL-оператор |
|---|---|---|
| Article | `ar` | `DOCTYPE(ar)` |
| Review | `re` | `DOCTYPE(re)` |
| Conference Paper | `cp` | `DOCTYPE(cp)` |
| Book | `bk` | `DOCTYPE(bk)` |
| Book Chapter | `ch` | `DOCTYPE(ch)` |
| Letter | `le` | `DOCTYPE(le)` |
| Editorial | `ed` | `DOCTYPE(ed)` |
| Note | `no` | `DOCTYPE(no)` |
| Short Survey | `sh` | `DOCTYPE(sh)` |

*Неизвестные значения (нет в маппинге): передаются as-is в нижнем регистре и логируются на уровне WARNING — не блокируют запрос.*

```python
# Маппинг: human-readable label → Scopus DOCTYPE code
_DOC_TYPE_MAP: dict[str, str] = {
    "Article": "ar",
    "Review": "re",
    "Conference Paper": "cp",
    "Book": "bk",
    "Book Chapter": "ch",
    "Letter": "le",
    "Editorial": "ed",
    "Note": "no",
    "Short Survey": "sh",
}

def _build_query(self, keyword: str, filters: dict | None) -> str:
    """Строит CQL-запрос Scopus из ключевого слова и опциональных фильтров."""
    parts: list[str] = [f'TITLE-ABS-KEY("{keyword}")']

    if not filters:
        return parts[0]

    # Год публикации
    if (year_from := filters.get("year_from")) is not None:
        parts.append(f"PUBYEAR > {int(year_from) - 1}")
    if (year_to := filters.get("year_to")) is not None:
        parts.append(f"PUBYEAR < {int(year_to) + 1}")

    # Типы документов
    if doc_types := filters.get("doc_types"):
        codes = [
            _DOC_TYPE_MAP.get(dt, dt.lower())  # fallback: as-is lowercase
            for dt in doc_types
            if dt
        ]
        if codes:
            parts.append(f"DOCTYPE({','.join(codes)})")

    # Open Access
    if filters.get("open_access"):
        parts.append("OA(1)")

    # Страны аффиляции
    if countries := filters.get("country"):
        quoted = [f'"{c}"' if ' ' in c else c for c in countries]
        parts.append(f"AFFILCOUNTRY({','.join(quoted)})")

    return " AND ".join(parts)
```

**Изменение 2б:** обновить сигнатуру `search()` и использовать `_build_query()`:

```python
async def search(
    self,
    keyword: str,
    count: int = 25,
    filters: dict | None = None,
) -> List[Article]:
    page_size = min(count, 25)
    query_string = self._build_query(keyword, filters)

    params = {
        "query": query_string,   # ← было: f"TITLE-ABS-KEY({keyword})"
        "count": page_size,
        "field": SCOPUS_FIELDS,
        "apiKey": settings.SCOPUS_API_KEY,
    }
    # ... остальное без изменений
```

#### Слой 3 — `app/services/search_service.py`

**Изменение:** передать `filters` в `search_client.search()`.

```python
# Было:
articles = await self.search_client.search(keyword=keyword, count=count)

# Станет:
articles = await self.search_client.search(
    keyword=keyword,
    count=count,
    filters=filters,   # пробрасываем фильтры в CQL-запрос
)
```

Сохранение итогового CQL в историю (см. §6) реализуется здесь же: после вызова `search_client.search()` берём `self.search_client.last_cql_query` (новый property) и добавляем его в `filters_payload` под ключом `"scopus_query"` перед передачей в `history_repo.insert_row()`.

#### Слой 4 — `app/routers/articles.py`

[VERIFIED: уже реализовано] Роутер принимает все параметры фильтрации и передаёт в `find_and_save(filters=filters_payload or None)`. Изменений в роутере не требуется — после правок в Слоях 1–3 фильтры автоматически попадут в CQL.

#### Слой 5 — `frontend/src/api/articles.ts`

**Изменение:** расширить `findArticles()` параметром `filters`.

```typescript
import type { ArticleClientFilters } from '../types/api';

export async function findArticles(
  keyword: string,
  count: number = 25,
  filters?: ArticleClientFilters,
): Promise<FindArticlesResult> {
  const params = new URLSearchParams({ keyword, count: String(count) });

  if (filters) {
    if (filters.yearFrom != null)  params.set('year_from', String(filters.yearFrom));
    if (filters.yearTo != null)    params.set('year_to',   String(filters.yearTo));
    if (filters.openAccessOnly)    params.set('open_access', 'true');

    // Массивы: repeated query params: ?doc_types=Article&doc_types=Review
    filters.docTypes?.forEach((t) => params.append('doc_types', t));
    // Бэкенд принимает country (не countries) — см. router
    filters.countries?.forEach((c) => params.append('country', c));
  }

  const response = await apiClient.get<ArticleResponse[]>('/articles/find', { params });
  // ... остальное без изменений
}
```

#### Слой 6 — `frontend/src/stores/articleStore.ts`

**Изменение:** читать `historyFilters` из `historyStore` и передавать в `findArticles()`.

```typescript
searchScopusLive: async (keyword: string) => {
  set({ isLiveSearching: true, error: null });
  try {
    // Читаем фильтры из historyStore синхронно
    const { useHistoryStore } = await import('./historyStore');
    const { historyFilters } = useHistoryStore.getState();

    const { articles, quota } = await findArticles(keyword, 25, historyFilters);
    // ... остальное без изменений
  }
}
```

### 3.2 Catalog Mode — серверная фильтрация

#### Слой 1 — `app/interfaces/catalog_repository.py`

**Изменение:** добавить параметры фильтрации в `get_all()` и `get_total_count()`.

```python
@abstractmethod
async def get_all(
    self,
    limit: int,
    offset: int,
    keyword: str | None = None,
    search: str | None = None,
    year_from: int | None = None,      # новые
    year_to: int | None = None,         # новые
    doc_types: list[str] | None = None, # новые
    open_access: bool | None = None,    # новые
    countries: list[str] | None = None, # новые
) -> List[Article]:
    pass

@abstractmethod
async def get_total_count(
    self,
    keyword: str | None = None,
    search: str | None = None,
    year_from: int | None = None,
    year_to: int | None = None,
    doc_types: list[str] | None = None,
    open_access: bool | None = None,
    countries: list[str] | None = None,
) -> int:
    pass
```

#### Слой 2 — `app/infrastructure/postgres_catalog_repo.py`

**Изменение:** реализовать SQL WHERE через SQLAlchemy Core / ORM.

Ключевые SQL-клаузы (псевдокод с SQLAlchemy):

```python
# Год публикации — через EXTRACT
if year_from is not None:
    stmt = stmt.where(extract('year', Article.publication_date) >= year_from)
if year_to is not None:
    stmt = stmt.where(extract('year', Article.publication_date) <= year_to)

# Тип документа — IN-список
if doc_types:
    stmt = stmt.where(Article.document_type.in_(doc_types))

# Open Access — boolean flag
if open_access is True:
    stmt = stmt.where(Article.open_access == True)

# Страны — IN-список
if countries:
    stmt = stmt.where(Article.affiliation_country.in_(countries))
```

*Одни и те же клаузы применяются в обоих методах — вынести в вспомогательную функцию `_apply_filters(stmt, **kwargs) -> stmt`.*

**Индексирование** [INFERRED — needs check]:
- `articles.document_type` — возможно, нет индекса; рекомендуется добавить в миграцию `0008`.
- `articles.affiliation_country` — аналогично.
- `articles.open_access` — partial index `WHERE open_access = true` будет эффективнее.
- `articles.publication_date` — уже индексирован через `Date` column [VERIFIED: модель].

#### Слой 3 — `app/services/catalog_service.py`

**Изменение:** принять и проксировать новые параметры фильтрации в методах `get_catalog_paginated()` и во внутренних вызовах репозитория.

#### Слой 4 — `app/routers/articles.py`

**Изменение:** добавить Query-параметры в `GET /articles/`:

```python
@router.get("/", response_model=PaginatedArticleResponse)
async def get_articles(
    page: int = Query(1, ge=1),
    size: int = Query(10, ge=1, le=100),
    keyword: str | None = Query(None, min_length=2),
    search: str | None = Query(None, min_length=2),
    year_from: int | None = Query(None, description="Фильтр: год публикации от"),
    year_to:   int | None = Query(None, description="Фильтр: год публикации до"),
    doc_types: list[str] | None = Query(None, description="Фильтр: типы документов"),
    open_access: bool | None = Query(None, description="Фильтр: только open-access"),
    countries: list[str] | None = Query(None, description="Фильтр: страны аффиляции"),
    service: CatalogService = Depends(get_catalog_service),
) -> PaginatedArticleResponse:
    return await service.get_catalog_paginated(
        page=page, size=size, keyword=keyword, search=search,
        year_from=year_from, year_to=year_to,
        doc_types=doc_types, open_access=open_access, countries=countries,
    )
```

#### Слой 5 — `frontend/src/api/articles.ts`

**Изменение:** расширить `GetArticlesParams` и функцию `getArticles()`:

```typescript
export interface GetArticlesParams {
  page?: number;
  size?: number;
  keyword?: string;
  search?: string;
  signal?: AbortSignal;
  // Новые параметры фильтрации
  yearFrom?: number;
  yearTo?: number;
  docTypes?: string[];
  openAccessOnly?: boolean;
  countries?: string[];
}

export async function getArticles(params: GetArticlesParams = {}): Promise<PaginatedArticleResponse> {
  const { page = 1, size = 10, keyword, search, signal,
          yearFrom, yearTo, docTypes, openAccessOnly, countries } = params;

  // URLSearchParams поддерживает append для repeated params
  const sp = new URLSearchParams({ page: String(page), size: String(size) });
  if (keyword)          sp.set('keyword', keyword);
  if (search)           sp.set('search', search);
  if (yearFrom != null) sp.set('year_from', String(yearFrom));
  if (yearTo != null)   sp.set('year_to', String(yearTo));
  if (openAccessOnly)   sp.set('open_access', 'true');
  docTypes?.forEach((t) => sp.append('doc_types', t));
  countries?.forEach((c) => sp.append('countries', c));

  const response = await apiClient.get<PaginatedArticleResponse>('/articles/', {
    params: sp, signal,
  });
  return response.data;
}
```

#### Слой 6 — `frontend/src/stores/articleStore.ts`

**Изменение:** передать фильтры из `historyStore` в `fetchArticles()`:

```typescript
fetchArticles: async (keyword?: string) => {
  const { page, size, filters } = get();
  const effectiveKeyword = keyword !== undefined ? keyword : filters.keyword;
  set({ isLoading: true, error: null });
  try {
    // Читаем client-фильтры из historyStore
    const { useHistoryStore } = await import('./historyStore');
    const { historyFilters } = useHistoryStore.getState();

    const data = await getArticles({
      page, size,
      keyword: effectiveKeyword,
      search: filters.search,
      // Передаём серверные фильтры
      yearFrom:      historyFilters.yearFrom,
      yearTo:        historyFilters.yearTo,
      docTypes:      historyFilters.docTypes,
      openAccessOnly: historyFilters.openAccessOnly,
      countries:     historyFilters.countries,
    });

    // applyClientFilters() УДАЛЯЕТСЯ — фильтрация теперь полностью серверная
    const sorted = get().sortBy === 'citations'
      ? [...data.articles].sort((a, b) => (b.cited_by_count ?? 0) - (a.cited_by_count ?? 0))
      : data.articles;

    const { appendMode, articles: prev, page: currentPage } = get();
    set({
      articles: appendMode && currentPage > 1 ? [...prev, ...sorted] : sorted,
      total: data.total,
      isLoading: false,
    });
  } catch (err) { /* без изменений */ }
}
```

**Удалить** функцию `applyClientFilters()` полностью.

***

## 4. Спецификация Filter UI

### 4.1 Общие принципы

Панель фильтров визуально и функционально идентична в обоих режимах (`scopus` и `catalog`). Различается только обработчик изменения: Scopus — перезапуск `searchScopusLive()`, Catalog — перезапуск `fetchArticles()`.

### 4.2 Document Type — аккордеон

**Текущее состояние** [VERIFIED: `ArticleFilters.tsx`]: список `<Checkbox>` всегда развёрнут, внутри `<section>`.

**Целевое поведение:**
- Компонент `<Accordion>` (shadcn/ui или самописный с `<details>`/`<summary>`).
- Header: текст "Document type" + иконка `ChevronDown` / `ChevronUp`.
- По умолчанию: **свёрнут**.
- При наличии ≥1 выбранного типа: справа от заголовка `<Badge variant="secondary">{count}</Badge>`.
- Внутри: список `<Checkbox>` (существующая разметка без изменений).
- Анимация раскрытия: `max-height` transition, 150ms ease.

```tsx
// Пример структуры
<div className="border-b border-slate-200 dark:border-slate-700">
  <button
    onClick={() => setDocTypeOpen(v => !v)}
    className="flex w-full items-center justify-between py-2 text-sm font-medium"
  >
    <span>Document type</span>
    <div className="flex items-center gap-1">
      {selectedCount > 0 && (
        <Badge variant="secondary" className="text-xs">{selectedCount}</Badge>
      )}
      <ChevronDown className={cn("h-4 w-4 transition-transform", docTypeOpen && "rotate-180")} />
    </div>
  </button>
  {docTypeOpen && (
    <div className="flex flex-col gap-1.5 pb-3">
      {/* checkbox list */}
    </div>
  )}
</div>
```

### 4.3 Open Access — одиночный Checkbox

**Текущее состояние** [VERIFIED]: `<Switch>`.

**Целевое:** заменить на `<Checkbox>` визуально идентичный checkbox'ам списка типов документов.

```tsx
// Было:
<Switch
  checked={!!filters.openAccessOnly}
  onCheckedChange={(checked) => setFilters({ openAccessOnly: checked || undefined })}
/>

// Станет:
<label className="flex items-center gap-2 text-sm cursor-pointer">
  <Checkbox
    checked={!!filters.openAccessOnly}
    onCheckedChange={(checked) =>
      setFilters({ openAccessOnly: checked ? true : undefined })
    }
  />
  <span>Open Access only</span>
</label>
```

### 4.4 Country — predictive text input

**Текущее состояние** [VERIFIED]: `<Popover>` + `<Command>` (combobox) с предзагруженным списком из `statsStore.stats.by_country`.

**Целевое:** predictive text input без dropdown-списка.

**Источник данных для предиктивного поиска:**
- Для **Catalog Mode**: список стран из `statsStore.stats.by_country` (текущий подход) — данные каталога.
- Для **Scopus Mode** [INFERRED — needs check]: список стран из ISO 3166-1 — захардкоженный или импортированный JSON-файл, т.к. `statsStore` содержит данные только каталога, а не глобального Scopus. Это покрывает произвольные страны, которых нет в каталоге.

**Реализация:**

```tsx
// Состояние компонента
const [inputValue, setInputValue] = useState('');
const [suggestions, setSuggestions] = useState<string[]>([]);

// Фильтрация по вводу
useEffect(() => {
  if (!inputValue.trim()) {
    setSuggestions([]);
    return;
  }
  const q = inputValue.toLowerCase();
  setSuggestions(
    countryList
      .filter((c) => c.toLowerCase().startsWith(q))
      .slice(0, 8)  // не более 8 подсказок
  );
}, [inputValue]);

// Рендер
<div className="relative">
  <input
    type="text"
    value={inputValue}
    onChange={(e) => setInputValue(e.target.value)}
    placeholder="Type country name..."
    className="w-full rounded border ..."
    aria-autocomplete="list"
    aria-controls="country-suggestions"
  />
  {suggestions.length > 0 && (
    <ul
      id="country-suggestions"
      role="listbox"
      className="absolute z-10 w-full border bg-white dark:bg-slate-900 rounded-md shadow-md mt-1"
    >
      {suggestions.map((country) => (
        <li
          key={country}
          role="option"
          className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800"
          onMouseDown={() => {
            toggleCountry(country);
            setInputValue('');
            setSuggestions([]);
          }}
        >
          {/* Flag emoji (unicode) — не требует внешних CDN */}
          <span aria-hidden="true">{getFlagEmoji(country)}</span>
          {country}
        </li>
      ))}
    </ul>
  )}
</div>

{/* Selected badges */}
{(filters.countries?.length ?? 0) > 0 && (
  <div className="mt-2 flex flex-wrap gap-1">
    {filters.countries!.map((c) => (
      <Badge key={c} variant="secondary" className="cursor-pointer flex gap-1"
             onClick={() => toggleCountry(c)}>
        <span>{getFlagEmoji(c)}</span>
        {c}
        <span aria-hidden="true">×</span>
      </Badge>
    ))}
  </div>
)}
```

**Функция `getFlagEmoji()`:**

```typescript
// Конвертация страны в unicode-флаг через двухбуквенный ISO-код
// Источник кодов: hardcoded map (country name → ISO-2)
function getFlagEmoji(countryName: string): string {
  const iso2 = COUNTRY_TO_ISO2[countryName];
  if (!iso2) return '🌐';
  return iso2
    .toUpperCase()
    .split('')
    .map((char) => String.fromCodePoint(char.charCodeAt(0) + 127397))
    .join('');
}
```

**Решение об использовании emoji-флагов вместо CDN**: emoji-флаги поддерживаются нативно в Unicode и не требуют внешних зависимостей. Их поддержка на macOS/Android/Windows (с 2021) достаточна для целевой аудитории (исследователи). Отдельная CDN-зависимость добавила бы риски доступности и CORS. [VERIFIED-DECISION]

### 4.5 Year range

Изменений нет. Два `<input type="number">` с `min`/`max` остаются без изменений [VERIFIED: текущая реализация корректна].

### 4.6 Поднятие монтирования фильтров в `HomePage` (sidebar lift)

**Текущее состояние** [VERIFIED: `ArticleList.tsx`]: `ArticleFiltersSidebar` и `ArticleFiltersMobile` рендерятся внутри `ArticleList`, что делает невозможным вызов новых API-запросов при изменении фильтра — `ArticleList` не имеет доступа к `fetchArticles` / `searchScopusLive`.

**Изменения:**

**`ArticleList.tsx`:**
- Удалить импорт и все вхождения `<ArticleFiltersSidebar />` и `<ArticleFiltersMobile />`.
- Изменить layout: вместо `<div className="flex gap-6">` с sidebar внутри — просто `<div className="flex-1 min-w-0 flex flex-col gap-3">`.
- `ArticleList` больше не знает о фильтрах — pure presentation component.

**`HomePage.tsx`:**
- Добавить импорт `ArticleFiltersSidebar`, `ArticleFiltersMobile`.
- В Scopus-режиме:
```tsx
<div className="flex gap-6 items-start">
  <ArticleFiltersSidebar onFilterChange={handleFilterChange} />
  <div className="flex-1 min-w-0">
    <ArticleFiltersMobile onFilterChange={handleFilterChange} />
    <ArticleList ... />
    <ScopusPaginationBar ... />
  </div>
</div>
```
- В Catalog-режиме — аналогично.
- В анонимном режиме — sidebar не показывается (анонимный поиск фильтрами не управляется через серверные параметры; можно оставить только `ArticleFiltersMobile` для каталога или скрыть совсем — [INFERRED — needs check с владельцем продукта]).

**`onFilterChange` prop (новый):**

```typescript
// В HomePage: обработчик изменения фильтра зависит от текущего режима
const handleFilterChange = useCallback(() => {
  if (!lastKeyword) return;  // не перезапускаем без ключевого слова

  if (searchMode === 'scopus') {
    void searchScopusLive(lastKeyword);
  } else {
    setPage(1);
    void fetchArticles();
  }
}, [searchMode, lastKeyword, searchScopusLive, fetchArticles]);
```

*`lastKeyword` — ref или state, сохраняющий последний введённый поисковый запрос.*

### 4.7 Поведение применения фильтров — debounce

- **Scopus mode:** изменение любого фильтра → debounced 300ms → `searchScopusLive(currentKeyword)`. Если `currentKeyword === ''` — ничего не делаем.
- **Catalog mode:** изменение любого фильтра → debounced 300ms → `fetchArticles()` (автоматически сбрасывает `page = 1` через `setFilters`).
- Debounce реализуется в `FiltersContent` через `useEffect` + `useRef<ReturnType<typeof setTimeout>>` или хуком `useDebounce`.
- Альтернатива: debounce вынести в `HomePage.handleFilterChange` — предпочтительно, т.к. `FiltersContent` остаётся "тупым" презентационным компонентом.

***

## 5. Дизайн состояния фильтров

### 5.1 Где хранить фильтры

**Решение: оставить в `historyStore`** [ARCHITECTURAL DECISION].

**Обоснование:**
1. [VERIFIED] Фильтры уже находятся в `historyStore.historyFilters` — рефакторинг не меняет место хранения, только добавляет использование этих данных в серверных запросах.
2. `historyStore` отвечает за состояние "что пользователь искал и с какими параметрами" — фильтры органически относятся к этой области ответственности.
3. Перенос в `articleStore` потребовал бы дублирования типов и сломал бы существующие тесты `historyStore.test.ts`.
4. `historyStore` уже импортируется в `articleStore` для чтения `historyFilters` — паттерн cross-store зависимости уже задокументирован и работает.

**Контраргумент:** `articleStore` управляет lifecycle запросов к API, было бы архитектурно чище держать все параметры одного запроса в одном сторе. Это решение откладывается на будущий рефакторинг и не является требованием текущего ТЗ.

### 5.2 Тип `ArticleClientFilters` после рефакторинга

```typescript
// frontend/src/types/api.ts — без изменений в структуре типа [VERIFIED]
export interface ArticleClientFilters {
  yearFrom?: number;       // передаётся в API как year_from
  yearTo?: number;         // передаётся в API как year_to
  docTypes?: string[];     // передаётся в API как repeated doc_types
  openAccessOnly?: boolean; // передаётся в API как open_access
  countries?: string[];    // передаётся в API как repeated country (catalog) / country (Scopus)
}
```

*Тип не меняется — только меняется то, как он используется (серверные запросы вместо client-side фильтрации).*

### 5.3 Правила сброса фильтров

| Событие | Сброс фильтров | Механизм |
|---|---|---|
| Очистка поля поиска (пустой query) | Нет автосброса | Фильтры сохраняются — пользователь мог настроить их заранее |
| Переключение режима `scopus ↔ catalog` | **Полный сброс** `historyFilters` | `useEffect` в `HomePage` следит за `searchMode` и вызывает `setHistoryFilters({})` |
| Logout | **Полный сброс** | В `authStore.logout()` добавить `useHistoryStore.getState().setHistoryFilters({})` |
| Нажатие кнопки "Clear filters" | Полный сброс | Уже реализовано в `FiltersContent.clearFilters()` [VERIFIED] |

### 5.4 Вычисляемое поле `filteredResults` в `historyStore`

[DECISION]: **Удалить** — фильтрация теперь полностью серверная. `historyStore` не должен содержать вычисляемых производных результатов поиска. `applyClientFilters()` в `articleStore` также удаляется.

***

## 6. Персистенция фильтров в истории поиска

### 6.1 Текущее состояние

[VERIFIED: `search_history.py`]: `SearchHistory.filters` — поле типа `JsonField` (JSONB на PG, TEXT+JSON на SQLite). Уже хранит словарь фильтров `{ year_from, year_to, doc_types, open_access, country }`, переданных пользователем.

`SearchHistoryItemResponse` [VERIFIED] экспонирует `filters: dict` — фронтенд его получает.

### 6.2 Добавление CQL-строки запроса

**Решение: хранить в `filters` JSONB под ключом `"scopus_query"` — НЕ добавлять отдельную колонку** [ARCHITECTURAL DECISION].

**Обоснование:**
1. Добавление колонки требует новой Alembic-миграции (`0008`), что увеличивает накладные расходы на деплой.
2. `scopus_query` является атрибутом конкретного способа фильтрации (CQL), а не фундаментальным атрибутом записи истории. JSONB более гибкий для таких расширений.
3. Контракт `SearchHistoryItemResponse` уже экспонирует `filters: dict` — фронтенд уже может читать произвольные ключи.
4. Не требует изменений в SQLAlchemy-модели и Pydantic-схеме.

**Контраргумент:** ключ `scopus_query` в JSONB не типизирован и не проиндексирован — при необходимости полнотекстового поиска по CQL в будущем понадобится миграция. Это осознанный трейдофф.

**Реализация в `SearchService.find_and_save()`:**

```python
# Получаем CQL-строку из клиента после вызова search()
articles = await self.search_client.search(keyword=keyword, count=count, filters=filters)

# Добавляем CQL в filters_payload для истории
filters_for_history = dict(filters) if filters else {}
# ScopusHTTPClient хранит последний отправленный query в _last_cql_query (новый property)
if hasattr(self.search_client, 'last_cql_query') and self.search_client.last_cql_query:
    filters_for_history['scopus_query'] = self.search_client.last_cql_query

history_row = await self.history_repo.insert_row(
    user_id=user_id,
    query=keyword,
    result_count=len(articles_with_ids),
    filters=filters_for_history,
)
```

**Новый property в `ScopusHTTPClient`:**

```python
@property
def last_cql_query(self) -> str | None:
    return self._last_cql_query  # сохраняется в search() после _build_query()
```

**Добавить в `ISearchClient` контракт:**

```python
@property
@abstractmethod
def last_cql_query(self) -> str | None: ...
```

### 6.3 Frontend — отображение CQL

**`SearchHistoryItem` type** (без изменений структуры):
```typescript
// filters: Record<string, unknown> — уже включает scopus_query
// Читать: item.filters?.scopus_query as string | undefined
```

**`ExplorePage` / история поисков:**
В компоненте, отображающем историю поиска, при наличии `item.filters?.scopus_query`:

```tsx
{item.filters?.scopus_query && (
  <div className="mt-1 text-xs text-slate-400 font-mono truncate" title={item.filters.scopus_query as string}>
    CQL: {item.filters.scopus_query as string}
  </div>
)}
```

***

## 7. План тестового покрытия

### 7.1 Backend (pytest)

| Файл | Класс/describe | Тест-кейс | Тип |
|---|---|---|---|
| `tests/test_scopus_client.py` | `TestBuildQuery` | `test_keyword_only` — только `TITLE-ABS-KEY`, нет AND-клауз | unit |
| | | `test_year_from_only` — `PUBYEAR > {year-1}` | unit |
| | | `test_year_to_only` — `PUBYEAR < {year+1}` | unit |
| | | `test_year_range` — оба оператора в правильном порядке | unit |
| | | `test_doc_types_single` — `DOCTYPE(ar)` для "Article" | unit |
| | | `test_doc_types_multiple` — `DOCTYPE(ar,re)` | unit |
| | | `test_doc_types_unknown_passthrough` — неизвестный тип переходит as-is lowercase | unit |
| | | `test_open_access_true` — добавляет `OA(1)` | unit |
| | | `test_open_access_false` — `OA(1)` не добавляется | unit |
| | | `test_country_single_word` — без кавычек | unit |
| | | `test_country_multi_word` — `"United States"` в кавычках | unit |
| | | `test_country_multiple` — несколько стран | unit |
| | | `test_all_filters_combined` — все фильтры одновременно, проверить порядок AND-клауз | unit |
| | | `test_filters_none` — `filters=None` возвращает только `TITLE-ABS-KEY(...)` | unit |
| | | `test_filters_empty_dict` — `filters={}` возвращает только `TITLE-ABS-KEY(...)` | unit |
| | | `test_year_edge_zero` — `year_from=0` не вызывает исключения | unit |
| | | `test_doc_types_empty_list` — пустой список не добавляет DOCTYPE | unit |
| | `TestScopusHTTPClientSearch` | `test_search_passes_filters_to_query` — mock httpx, проверить что `params["query"]` содержит CQL с фильтрами | unit |
| | | `test_last_cql_query_stored_after_search` — после вызова `search()` доступен `last_cql_query` | unit |
| `tests/test_search_service.py` | `TestFindAndSave` | `test_find_and_save_passes_filters_to_search_client` — mock `search_client.search`, проверить, что он вызван с `filters=` | unit |
| | | `test_find_and_save_filters_none_still_works` — `filters=None` не вызывает исключения | unit |
| | | `test_find_and_save_stores_scopus_query_in_history` — `history_repo.insert_row` получает `filters` с ключом `scopus_query` | unit |
| `tests/test_catalog_repo.py` | `TestGetAllWithFilters` | `test_get_all_year_from_filter` — SQL содержит `EXTRACT(YEAR ...)>=year_from` | integration |
| | | `test_get_all_year_to_filter` | integration |
| | | `test_get_all_year_range_filter` | integration |
| | | `test_get_all_doc_types_filter_single` — только статьи с нужным `document_type` | integration |
| | | `test_get_all_doc_types_filter_multiple` — список типов | integration |
| | | `test_get_all_open_access_filter` — только `open_access=true` | integration |
| | | `test_get_all_countries_filter_single` | integration |
| | | `test_get_all_countries_filter_multiple` | integration |
| | | `test_get_all_combined_filters` — все 5 фильтров одновременно | integration |
| | `TestGetTotalCountWithFilters` | `test_get_total_count_year_from` | integration |
| | | `test_get_total_count_doc_types` | integration |
| | | `test_get_total_count_open_access` | integration |
| | | `test_get_total_count_countries` | integration |
| | | `test_get_total_count_combined_filters` — consistent с get_all | integration |
| `tests/test_articles_router.py` | `TestFindArticlesEndpoint` | `test_get_find_all_filter_params_reach_scopus_client` — mock ScopusHTTPClient, проверить CQL | integration |
| | | `test_get_find_year_filter_in_cql` | integration |
| | | `test_get_find_doc_types_in_cql` | integration |
| | `TestGetArticlesEndpoint` | `test_get_articles_year_from_filter` — ответ содержит только статьи ≥year | integration |
| | | `test_get_articles_doc_types_filter` | integration |
| | | `test_get_articles_open_access_filter` | integration |
| | | `test_get_articles_countries_filter` | integration |
| | | `test_get_articles_combined_filters` | integration |

### 7.2 Frontend (Vitest)

| Файл | describe | Тест-кейс | Тип |
|---|---|---|---|
| `frontend/src/stores/historyStore.test.ts` | `filter reset` | `resets historyFilters on mode switch to scopus` | unit |
| | | `resets historyFilters on mode switch to catalog` | unit |
| | | `resets historyFilters on logout` | unit |
| | `setHistoryFilters` | `partial merge preserves other fields` — уже есть [VERIFIED] | unit |
| `frontend/src/stores/articleStore.test.ts` | `fetchArticles` | `includes yearFrom in URL when historyFilters.yearFrom is set` | unit |
| | | `includes yearTo in URL` | unit |
| | | `includes docTypes as repeated params` | unit |
| | | `includes open_access=true when openAccessOnly` | unit |
| | | `includes countries as repeated params` | unit |
| | | `does not include filter params when historyFilters is empty` | unit |
| | `searchScopusLive` | `passes historyFilters.yearFrom to findArticles` | unit |
| | | `passes historyFilters.docTypes to findArticles` | unit |
| | | `passes historyFilters.countries to findArticles` | unit |
| | | `does not pass filters when historyFilters is empty` | unit |
| `frontend/src/components/articles/ArticleFilters.test.tsx` | `DocType accordion` | `is collapsed by default` | unit |
| | | `expands on header click` | unit |
| | | `collapses on second header click` | unit |
| | | `shows count badge when doc types are selected` | unit |
| | | `does not show badge when no types selected` | unit |
| | `DocType checkboxes` | `selecting a doc type calls setHistoryFilters with docTypes` | unit |
| | | `deselecting removes type from docTypes array` | unit |
| | `Open Access checkbox` | `renders Checkbox not Switch` | unit |
| | | `toggles openAccessOnly on check` | unit |
| | | `sets openAccessOnly to undefined on uncheck` | unit |
| | `Country predictive input` | `typing 3 chars shows filtered suggestions` | unit |
| | | `suggestions list hidden on empty input` | unit |
| | | `selecting suggestion adds it to countries and clears input` | unit |
| | | `selecting suggestion shows badge chip` | unit |
| | | `clicking badge chip removes country from filters` | unit |
| | | `flag emoji rendered next to suggestion` | unit |
| | `clearFilters` | `clicking Clear filters resets all historyFilters fields` | unit |
| | | `Clear filters button hidden when no active filters` | unit |

***

## 8. План коммитов

### Ветка: `filtration`

| # | Заголовок коммита | Изменяемые файлы | Описание изменений | Риски и зависимости |
|---|---|---|---|---|
| 1 | `feat(backend): add filters param to ISearchClient.search()` | `app/interfaces/search_client.py` | Добавить `filters: dict \| None = None` в абстрактный метод и `last_cql_query` property в контракт | Базовый коммит — все backend-коммиты зависят от него |
| 2 | `feat(backend): implement CQL builder in ScopusHTTPClient` | `app/infrastructure/scopus_client.py` | Добавить `_DOC_TYPE_MAP`, метод `_build_query()`, обновить `search()`, добавить `_last_cql_query` property | Зависит от коммита 1. Риск: Scopus API может отклонить некорректный CQL — нужны smoke-тесты вручную |
| 3 | `feat(backend): pass filters to ScopusHTTPClient in SearchService` | `app/services/search_service.py` | Пробросить `filters` в `search_client.search()`, сохранить `scopus_query` в `filters_for_history` | Зависит от коммита 2 |
| 4 | `feat(backend): add filter params to GET /articles/` | `app/routers/articles.py`, `app/interfaces/catalog_repository.py`, `app/services/catalog_service.py` | Добавить 5 новых Query-params в роутер, расширить интерфейс репозитория | Зависит от коммита 1. Каталог-репозиторий — отдельный commit 5 |
| 5 | `feat(backend): implement filter SQL clauses in PostgresCatalogRepo` | `app/infrastructure/postgres_catalog_repo.py` | Реализовать `_apply_filters()`, обновить `get_all()` и `get_total_count()` | Зависит от коммита 4. Риск: производительность при отсутствии индексов |
| 6 | `feat(backend): add DB indexes for filter columns` | `alembic/versions/0008_add_filter_indexes.py` | Миграция: индексы на `document_type`, `affiliation_country`, partial index `open_access=true` | Зависит от коммита 5. Требует `alembic upgrade head` |
| 7 | `test(backend): CQL builder unit tests` | `tests/test_scopus_client.py` | 17 unit-тестов для `_build_query()` и `search()` | Зависит от коммита 2 |
| 8 | `test(backend): SearchService filter pass-through tests` | `tests/test_search_service.py` | 3 unit-теста | Зависит от коммита 3 |
| 9 | `test(backend): catalog repo filter integration tests` | `tests/test_catalog_repo.py` | 10 integration-тестов с SQLite | Зависит от коммита 5 |
| 10 | `test(backend): router integration tests for filter params` | `tests/test_articles_router.py` | 9 integration-тестов | Зависит от коммитов 3, 4, 5 |
| 11 | `feat(frontend): extend getArticles() and findArticles() with filter params` | `frontend/src/api/articles.ts` | Добавить фильтр-параметры в обе API-функции через `URLSearchParams` | Независим от backend-коммитов до деплоя; можно делать параллельно |
| 12 | `feat(frontend): pass historyFilters to server in fetchArticles and searchScopusLive` | `frontend/src/stores/articleStore.ts` | Убрать `applyClientFilters()`, читать `historyStore.historyFilters`, передавать в API | Зависит от коммита 11. **Критический коммит** — меняет поведение |
| 13 | `feat(frontend): reset historyFilters on mode switch and logout` | `frontend/src/stores/historyStore.ts`, `frontend/src/stores/authStore.ts` | `setHistoryFilters({})` при смене режима в `articleStore`, при `logout` в `authStore` | Зависит от коммита 12 |
| 14 | `feat(frontend): DocType accordion in ArticleFilters` | `frontend/src/components/articles/ArticleFilters.tsx` | Добавить `useState(false)` для раскрытия, badge с числом, ChevronDown | Независим от бэкенда |
| 15 | `feat(frontend): replace OA Switch with Checkbox in ArticleFilters` | `frontend/src/components/articles/ArticleFilters.tsx` | Заменить `<Switch>` на `<Checkbox>` | Можно сделать в одном коммите с коммитом 14 |
| 16 | `feat(frontend): country predictive input with flag emoji` | `frontend/src/components/articles/ArticleFilters.tsx`, `frontend/src/constants/countries.ts` (новый) | Удалить Popover+Command, добавить текстовый input с предиктивными подсказками, `getFlagEmoji()`, `COUNTRY_TO_ISO2` map | Зависит от коммита 14/15. Риск: размер константы (195 стран) |
| 17 | `refactor(frontend): lift ArticleFilters out of ArticleList into HomePage` | `frontend/src/components/articles/ArticleList.tsx`, `frontend/src/pages/HomePage.tsx` | Удалить фильтры из `ArticleList`, добавить в `HomePage` с `onFilterChange` handler и debounce 300ms | Зависит от коммита 12. **Самый рискованный коммит UI** — меняет дерево компонентов |
| 18 | `test(frontend): extend historyStore.test.ts with filter reset cases` | `frontend/src/stores/historyStore.test.ts` | 3 новых теста | Зависит от коммита 13 |
| 19 | `test(frontend): extend articleStore.test.ts with filter URL params` | `frontend/src/stores/articleStore.test.ts` | 10 новых тестов | Зависит от коммита 12 |
| 20 | `test(frontend): ArticleFilters.test.tsx — full component test suite` | `frontend/src/components/articles/ArticleFilters.test.tsx` (новый) | 20 unit/component тестов | Зависит от коммитов 14–16 |
| 21 | `test(frontend): integration smoke test — filter params reach backend` | `frontend/src/components/articles/ArticleFilters.integration.test.tsx` (новый) | Cypress или Vitest+MSW: фильтр → проверить URL запроса | Зависит от коммит 17 |

***

## 9. Открытые вопросы и риски

### 9.1 Вопросы, требующие проверки с Scopus API

| # | Вопрос | Критичность | Способ проверки |
|---|---|---|---|
| В-1 | Поддерживает ли бесплатный API Key `AFFILCOUNTRY()` в CQL? Нет ли ограничений на составные запросы? | Высокая | Тестовый запрос с curl к `api.elsevier.com` |
| В-2 | Как Scopus реагирует на `DOCTYPE(ar,re,cp)` — работает ли перечисление кодов через запятую? | Высокая | Тестовый запрос |
| В-3 | Нужны ли кавычки вокруг ключевого слова в `TITLE-ABS-KEY("{keyword}")` при наличии AND-клауз? | Средняя | Тест двух вариантов |
| В-4 | Список кодов DOCTYPE полный? Все 9 кодов в таблице §3.1 — [INFERRED из Scopus Docs] | Средняя | Сверить с официальной документацией Elsevier |
| В-5 | `AFFILCOUNTRY` принимает русские и нелатинские названия стран или только английские? | Средняя | Тест с конкретными значениями |

### 9.2 Frontend-риски

| # | Риск | Вероятность | Митигация |
|---|---|---|---|
| Р-1 | `countriesOpen` state в `FiltersContent` уже используется — удаление Popover может сломать другое место | Низкая | Проверить все упоминания `countriesOpen` при рефакторинге |
| Р-2 | Размер файла `countries.ts` (195 стран + ISO2 коды): может увеличить bundle | Низкая | Lazy import или tree-shaking; ~8KB gzip |
| Р-3 | Debounce в `handleFilterChange` + мгновенный вызов `setHistoryFilters` = стейт мог успеть обновиться только частично | Средняя | В debounce-обработчике читать `historyStore.getState()` — не из замыкания |
| Р-4 | `ArticleList` без sidebar меняет layout — sidebar теперь снаружи. Нужно проверить responsive breakpoints | Средняя | Скриншот-тест на 375px, 768px, 1280px |
| Р-5 | Анонимный режим — показывать ли фильтры? | [INFERRED — нужно решение владельца] | По умолчанию: sidebar скрыт для анонимов |

### 9.3 Backend-риски

| # | Риск | Вероятность | Митигация |
|---|---|---|---|
| Б-1 | Отсутствие индексов на `document_type`, `affiliation_country` — полный SCAN по ~39K строк | Высокая | Коммит 6 добавляет индексы до деплоя |
| Б-2 | `postgres_catalog_repo.py` не читался [UNVERIFIED] — возможны конфликты с текущей реализацией `get_all()` | Средняя | Прочитать перед коммитом 5 |
| Б-3 | `catalog_service.py` не читался [UNVERIFIED] — сигнатура `get_catalog_paginated()` может не совпадать с предположениями | Средняя | Прочитать перед коммитом 4 |
| Б-4 | SQLite в тестах не поддерживает `EXTRACT()` так же, как PostgreSQL | Высокая | Заменить на `strftime('%Y', ...)` для SQLite через dialect check, или перейти полностью на pytest-PostgreSQL для тестов репозитория |
| Б-5 | `cross-store import` (`historyStore` в `articleStore`) уже работает через dynamic import — риск circular dependency при рефакторинге | Низкая | Убедиться, что `historyStore` не импортирует `articleStore` |