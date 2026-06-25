# Фильтрация статей — ТЗ и план реализации (filtering-2)

> Ветка: `filtering-2` | Дата: 2026-06-25  
> Предшественник: ветка `filtering` (PR #15, merge `f5dc0f2`) — реализован скелет фильтров,
> содержит критические баги (см. ниже).

---

## 1. Контекст: два режима поиска

Приложение работает в двух режимах, управляемых переключателем в `HomePage.tsx`:

| Режим | Источник данных | Авторизация | Эндпоинт |
|---|---|---|---|
| **Catalog** | Локальная Supabase БД | Нет (публичный) | `GET /articles/` |
| **Scopus** | Scopus API (Elsevier) | Обязательна | `GET /articles/find` |

Фильтры — общий UI для обоих режимов, но логика применения принципиально разная.

---

## 2. Каталог найденных багов (adversarial-анализ)

### B1 — КРИТИЧЕСКИЙ: фильтр не вызывает ре-фетч
**Файл:** `frontend/src/stores/historyStore.ts`  
`setHistoryFilters()` обновляет стор, но не вызывает `fetchArticles()` / `searchScopusLive()`.  
Пользователь меняет фильтр — список статей не меняется.

### B2 — ВЫСОКИЙ: неверный источник опций в Scopus-режиме
**Файл:** `frontend/src/components/articles/ArticleFilters.tsx`  
Опции для `doc_types` и `countries` берутся из `statsStore.stats` (данные каталога).  
Scopus-поиск работает со всей глобальной базой — опции каталога нерелевантны.

### B3 — ВЫСОКИЙ: фильтр-состояние не сбрасывается при смене режима
**Файл:** `frontend/src/pages/HomePage.tsx`  
`historyFilters` из `historyStore` разделяются между режимами.  
Фильтр «Conference Paper» из каталога незаметно применяется к глобальному Scopus-поиску.

### B4 — ВЫСОКИЙ: ключевое слово не сохраняется в Scopus-режиме
**Файл:** `frontend/src/components/search/SearchBar.tsx`  
`value` — локальный `useState`. После `handleSearch(query)`:
- Catalog: `setFilters({ search: query })` → сохраняется в сторе
- Scopus: `searchScopusLive(query)` → keyword нигде не сохраняется

При авто-ре-поиске (при смене фильтра) в Scopus-режиме нечем повторить запрос.

### B5 — СРЕДНИЙ: некорректная проверка числовых параметров в API
**Файл:** `frontend/src/api/articles.ts`  
```typescript
if (year_from) queryParams.set('year_from', String(year_from));
// year_from=0 → falsy → параметр не отправляется
```
Следует использовать `if (year_from != null)`.

### B6 — НИЗКИЙ (defensive): `open_access=False` не генерирует `NOT OA(1)` в CQL
**Файл:** `app/infrastructure/scopus_client.py`  
```python
if filters.get("open_access"):  # True → OA(1), False → пропускается
```
UI никогда не отправляет `False`, поэтому баг не проявляется, но код некорректен.

### B7 — СРЕДНИЙ: квота не декрементируется в UI после успешного поиска
**Файл:** `frontend/src/stores/articleStore.ts` / `quotaStore.ts`  
После `searchScopusLive()` квота не обновляется до следующего вызова `fetchQuota()`.

### B8 — СРЕДНИЙ: нет индикатора «фильтры изменены, требуется новый поиск» в Scopus-режиме
**Файл:** `frontend/src/components/articles/ArticleFilters.tsx`  
В Scopus-режиме пользователь не знает, что фильтры применятся только при следующем поиске.

### B9 — АРХИТЕКТУРНЫЙ: `searchMode` изолирован в local `useState` `HomePage`
**Файл:** `frontend/src/pages/HomePage.tsx`  
```typescript
const [searchMode, setSearchMode] = useState<'scopus' | 'catalog'>('scopus');
```
`ArticleFilters` не имеет доступа к режиму ни через пропсы, ни через стор.  
Это корневая причина B2 и B8.

### B10 — ВЫСОКИЙ: смена фильтра не сбрасывает пагинацию
**Файл:** `frontend/src/stores/historyStore.ts`  
`setHistoryFilters()` не взаимодействует с `articleStore.page`.  
Авто-применение фильтра на странице N → фетч страницы N отфильтрованного результата (почти всегда пустой).

### B11 — СРЕДНИЙ: `clearFilters()` не ре-фетчит
**Файл:** `frontend/src/components/articles/ArticleFilters.tsx`  
`clearFilters()` → `setHistoryFilters({...undefined})` → список статей не обновляется.

### B12 — СРЕДНИЙ: keyword не хранится для Scopus-ре-поиска
Следствие B4. При изменении фильтра в Scopus-режиме негде взять keyword для повтора запроса.

### B13 — ВЫСОКИЙ: `historyFilters` разделяются между режимами
**Следствие B3:** Пользователь ставит фильтр в каталоге → переключается в Scopus →
незаметно тратит квоту с применёнными фильтрами каталога.

---

## 3. Техническое задание (продакшн-версия)

### 3.1 Контракт двух режимов

| Параметр | CATALOG | SCOPUS |
|---|---|---|
| Источник статей | `GET /articles/` | `GET /articles/find` |
| Триггер применения фильтра | Авто (debounce 400 мс) | Явный ре-поиск пользователем |
| Источник опций Doc Types | `statsStore.by_doc_type` | Константа `SCOPUS_DOC_TYPES` |
| Источник опций Countries | `statsStore.by_country` | Константа `SCOPUS_COUNTRIES` |
| Bounds для года (min/max) | min/max из stats | min=1900, max=текущий год |
| Keyword для ре-поиска | `articleStore.filters.search` | `articleStore.currentKeyword` |
| Состояние фильтров | Сбрасывается при смене режима через `resetFilters()` | ← то же |

### 3.2 UI фильтр-панели

| Фильтр | Компонент | Каталог | Scopus |
|---|---|---|---|
| Year from / to | `<input type="number">` | Debounce 400 мс → авто-фетч | Debounce 400 мс → показать badge |
| **Document type** | `Popover` + `Command` (multi-select) | Мгновенный → авто-фетч | Мгновенный → показать badge |
| Open Access | `Checkbox` | Мгновенный → авто-фетч | Мгновенный → показать badge |
| **Country** | `Popover` + `Command` + поиск (multi-select) | Мгновенный → авто-фетч | Мгновенный → показать badge |
| Выбранные значения | `Badge` ×N (кликабельные для удаления) | Под каждым полем | ← то же |

**Dropdown UI:** оба поля (`doc_types`, `countries`) реализуются через уже имеющиеся
`Popover` + `Command` из `frontend/src/components/ui/` (паттерн multi-select combobox).

### 3.3 Поведение badge «Filters changed»

В Scopus-режиме при любом изменении `historyFilters` показывается banner/badge рядом с
кнопкой Search:
> «Фильтры изменены — нажмите Search для применения»

Badge исчезает после успешного завершения `searchScopusLive()`.

### 3.4 Новые поля в `articleStore`

```typescript
// Добавляется в articleStore.ts
searchMode:      'scopus' | 'catalog'  // источник правды (убираем из local useState HomePage)
currentKeyword:  string | null         // последнее ключевое слово (оба режима)

setSearchMode(mode: SearchMode): void  // сбрасывает historyFilters при смене
setCurrentKeyword(kw: string): void
```

### 3.5 Новые данные для Scopus-режима

```typescript
// frontend/src/constants/scopusFilters.ts
export const SCOPUS_DOC_TYPES = [
  'Article', 'Review', 'Conference Paper', 'Book Chapter',
  'Editorial', 'Letter', 'Note', 'Short Survey',
] as const;

// ~80 основных научных центров, покрывающих >95% публикаций Scopus:
export const SCOPUS_COUNTRIES = [
  'United States', 'China', 'United Kingdom', 'Germany', 'Japan',
  'France', 'Italy', 'Canada', 'Australia', 'South Korea',
  'India', 'Spain', 'Netherlands', 'Brazil', 'Switzerland',
  'Sweden', 'Russia', 'Turkey', 'Poland', 'Belgium',
  'Denmark', 'Austria', 'Norway', 'Finland', 'Israel',
  'Singapore', 'Portugal', 'Czech Republic', 'Greece', 'Iran',
  'Mexico', 'Argentina', 'South Africa', 'New Zealand', 'Ireland',
  'Hungary', 'Romania', 'Ukraine', 'Croatia', 'Slovakia',
  'Thailand', 'Malaysia', 'Indonesia', 'Vietnam', 'Philippines',
  'Saudi Arabia', 'Egypt', 'Nigeria', 'Kenya', 'Ethiopia',
  'Pakistan', 'Bangladesh', 'Sri Lanka', 'Taiwan', 'Hong Kong',
  'Colombia', 'Chile', 'Peru', 'Venezuela', 'Ecuador',
  'United Arab Emirates', 'Qatar', 'Kuwait', 'Jordan', 'Lebanon',
  'Morocco', 'Algeria', 'Tunisia', 'Ghana', 'Tanzania',
  'Lithuania', 'Latvia', 'Estonia', 'Bulgaria', 'Slovenia',
  'Serbia', 'Bosnia and Herzegovina', 'Albania', 'North Macedonia',
  'Iceland', 'Luxembourg', 'Malta', 'Cyprus',
] as const;
```

---

## 4. План реализации

### 4.1 Бэкенд (minimal)

| Файл | Изменение | Объём |
|---|---|---|
| `app/infrastructure/scopus_client.py` | `open_access=False` → добавить `NOT OA(1)` в CQL | ~3 строки |

### 4.2 Фронтенд — порядок реализации

#### Шаг 1: `frontend/src/types/api.ts`
Добавить тип `SearchMode`:
```typescript
export type SearchMode = 'scopus' | 'catalog';
```

#### Шаг 2: `frontend/src/constants/scopusFilters.ts` (новый файл)
Константы `SCOPUS_DOC_TYPES` и `SCOPUS_COUNTRIES` (см. §3.5).  
Не фетчатся, статичны.

#### Шаг 3: `frontend/src/stores/historyStore.ts`
Добавить `resetFilters()`:
```typescript
resetFilters: () => set({ historyFilters: {} })
```

#### Шаг 4: `frontend/src/stores/articleStore.ts`
Добавить поля и actions (см. §3.4).  
`setSearchMode` вызывает `useHistoryStore.getState().resetFilters()` при смене режима.

#### Шаг 5: `frontend/src/pages/HomePage.tsx`
- Убрать `useState<'scopus' | 'catalog'>`, читать `searchMode` из `articleStore`
- В `handleSearch(query)`: вызывать `setCurrentKeyword(query)` для обоих режимов
- При переключении режима: `setSearchMode(newMode)` (сброс фильтров встроен в action)

#### Шаг 6: `frontend/src/components/articles/ArticleFilters.tsx` (основное)
Полный рефактор компонента:
- Читает `searchMode`, `currentKeyword` из `articleStore`
- Режимно-зависимые опции (`stats` vs константы)
- `Popover + Command` для `doc_types` и `countries` вместо текущего UI
- Catalog: изменение фильтра → `articleStore.setPage(1)` + debounced `fetchArticles()`
- Scopus: изменение фильтра → локальный `filtersChanged = true` → badge
- `clearFilters()` → `resetFilters()` + авто-ре-фетч (catalog) или сброс badge (Scopus)

#### Шаг 7: `frontend/src/api/articles.ts`
- Исправить `if (year_from)` → `if (year_from != null)` (B5)

### 4.3 Матрица файлов

| Файл | Изменение | Сложность |
|---|---|---|
| `app/infrastructure/scopus_client.py` | Defensive fix (B6) | Tiny |
| `frontend/src/types/api.ts` | +`SearchMode` type | Tiny |
| `frontend/src/constants/scopusFilters.ts` | Новый файл (константы) | Small |
| `frontend/src/stores/historyStore.ts` | +`resetFilters()` | Tiny |
| `frontend/src/stores/articleStore.ts` | +`searchMode`, `currentKeyword`, actions | Small |
| `frontend/src/pages/HomePage.tsx` | Рефактор searchMode + setCurrentKeyword | Medium |
| `frontend/src/components/articles/ArticleFilters.tsx` | Полный рефактор | Large |
| `frontend/src/api/articles.ts` | Fix B5 (year_from truthy check) | Tiny |

**Не меняются:** `SearchService`, `CatalogService`, `postgres_catalog_repo.py`,
`scopus_client.py` (CQL-логика), `ArticleList.tsx`, `SearchBar.tsx`, все интерфейсы.

### 4.4 Тест-покрытие (ожидаемые изменения)

| Файл | Что обновить |
|---|---|
| `frontend/src/components/articles/ArticleList.test.tsx` | Обновить мок `useHistoryStore` если изменится его API |
| `frontend/src/stores/articleStore.test.ts` (если существует) | Добавить тесты для `setSearchMode`, `setCurrentKeyword` |

Существующий `ArticleList.test.tsx` мокирует `ArticleFilters` полностью — рефактор
`ArticleFilters.tsx` его не сломает.

---

## 5. Архитектурные инварианты (не нарушать)

1. `fetchStats()` вызывается глобально в `App.tsx:194` — не вызывать повторно в компонентах
2. `historyFilters` читается через `useHistoryStore.getState()` внутри async-actions (не через hook)
3. Advisory lock в `GET /articles/find` — в DI-фабрике `get_advisory_lock_factory()`, тесты перекрывают через `_noop_lock`
4. Новые тесты бизнес-логики `GET /articles/find` — маркер `requires_pg` НЕ нужен (pg_advisory_lock убран в commit `4f66ee2`)
5. `doc_types` → `document_types` при передаче в Scopus (каноническое внутреннее имя в `filters_payload`)

---

## 6. Известные ограничения (out of scope)

- `open_access=False` («только не-OA») — UI не поддерживает, не планируется
- Сохранение фильтров между сессиями (localStorage) — не планируется
- Обновление опций каталога в реальном времени (websocket/polling) — не планируется

---

## 7. Статус выполнения (итог, 2026-06-25)

**ТЗ выполнено полностью.** PR #16 смерджен в `main` (merge commit `d4637d7`).

| Раздел | Статус |
|---|---|
| 4.1 Backend (B6: NOT OA(1) в CQL) | ✅ commit `550767e` |
| 4.2 Шаги 1–7 (типы, константы, сторы, HomePage, ArticleFilters, B5-fix) | ✅ commits `df81f53`…`51b07bb` |
| 4.4 Тест-покрытие (169 frontend тестов, все зелёные) | ✅ commit `4a57469` |

Баги B1–B6, B8–B13 закрыты. B7 (quota decrement в UI) вне скоупа — частично покрыт существующим `fetchQuota()`.
Ветка `filtering-2` присутствует (локально и remote). Документация обновлена в `frontend/CLAUDE.md` и памяти агента.
- Scopus `NOT OA(1)` (B6) — defensive fix, UI никогда не генерирует `open_access=False`
