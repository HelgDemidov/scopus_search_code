Теперь у меня полная картина. Могу дать исчерпывающий ответ.

***

## 1. Верификация понимания задачи

Задача понята полностью и однозначно. Один нюанс, который стоит зафиксировать явно:

**Авторизованный пользователь + поиск по коллекции** — имеется в виду тот же `catalog_articles` (локальная база, `GET /articles/`), к которому сейчас обращается анонимный режим. Отдельного маршрута "для авторизованных по коллекции" в текущем UI нет — авторизованный пользователь сейчас всегда попадает в live-Scopus режим. Это означает, что **нужно добавить переключатель "Коллекция / Scopus"** внутри авторизованного режима `HomePage`. Прошу подтвердить, верно ли это допущение, или поиск по коллекции для авторизованных должен быть вынесен на отдельную страницу — например, на будущую `CollectionPage`?

> **Предположение для плана ниже**: переключатель "Scopus / Collection" добавляется прямо в авторизованную зону `HomePage`, как второй таб или кнопка-тоггл.

> **Предположение для плана ниже**: Да, именно так - авторизованному пользователю прямо на главной странице с поисковой строкой должна быть доступна кнопка-переключатель (на русском), сформулированный как-то наподобие следующего: "Поиск по базе Scopus / Поиск по тематической коллекции AI & Neural Network Technologies".

**Ограничение `ScopusPaginationBar`** — `size=10` + страничный счётчик до 3 страниц. `total` у `liveResults` — это `liveResults.length` (число реально вернувшихся записей, максимум 25). Следовательно `totalPages = Math.ceil(total / 10)` — максимум `Math.ceil(25/10) = 3`. Счётчик исчезает при `showAll=true` (рендерим только 25 без пагинатора). Это точно соответствует п. 2.1–2.3.

***

## 2. Карта изменений

```
frontend/src/
├── components/articles/
│   ├── ScopusPaginationBar.tsx          ← [НОВЫЙ] упрощённый пагинатор для live-Scopus
│   └── ScopusPaginationBar.test.tsx     ← [НОВЫЙ] unit-тесты
├── pages/
│   ├── HomePage.tsx                     ← [изменить] авторизованная зона: searchMode-таб,
│   │                                       wire-up catalog-пагинации и ScopusPaginationBar
│   └── HomePage.test.tsx                ← [изменить] добавить тесты нового функционала
└── stores/
    └── articleStore.ts                  ← [изменить] добавить liveSize и liveShowAll
                                            для управления Scopus-пагинацией
```

**Что не трогаем:**
- `PaginationBar.tsx` — он идеально подходит для catalog-режима авторизованного пользователя без изменений
- `ArticleList.tsx` — он уже принимает все нужные props; для catalog-режима авторизованного пользователя пробрасываем те же props, что и для анонима
- `ArticleList.test.tsx` / `PaginationBar.test.tsx` / `pagination.integration.test.tsx` — новые тесты идут в отдельные файлы
- Бэкенд — `GET /articles/` и `GET /articles/find` не трогаем

***

## 3. Детальный план изменений

### Шаг 1 — `articleStore.ts`: состояние Scopus-пагинации

Добавить два поля в интерфейс и стейт:

```typescript
liveSize: 10 | 'all';      // режим отображения live-результатов
setLiveSize: (s: 10 | 'all') => void;
```

`setLiveSize` не вызывает новый запрос к API — `liveResults` уже содержат все 25 записей. Переключение режима — только UI-срез поверх уже загруженных данных. Страница `livePage` отдельно не хранится в сторе: она локальный `useState` в `HomePage`, сбрасывается в 1 при смене `liveSize`.

> **Почему `liveSize` в сторе, а не `useState` в компоненте?** Потому что `ScopusPaginationBar.test.tsx` должен тестировать поведение независимо от `HomePage`. Если положить в стор — компонент можно тестировать изолированно, передавая props напрямую.

### Шаг 2 — `ScopusPaginationBar.tsx`: новый компонент

```typescript
interface ScopusPaginationBarProps {
  page: number;              // 1–3
  total: number;             // liveResults.length (≤ 25)
  liveSize: 10 | 'all';
  onPageChange: (p: number) => void;
  onSizeModeChange: (s: 10 | 'all') => void;
}
```

Логика рендера:

| Условие | Что рендерить |
|---|---|
| `liveSize === 'all'` | Только кнопки `[10]` `[Show all (25 max)]`, страничный ряд скрыт |
| `liveSize === 10` и `totalPages <= 1` | Только кнопки режима |
| `liveSize === 10` и `totalPages > 1` | Кнопки режима + страничный ряд `← [1][2][3] →` |

`totalPages = Math.min(Math.ceil(total / 10), 3)` — жёсткий cap 3 страницы.

Визуально отображаемые статьи при `liveSize === 10`:
`liveResults.slice((page - 1) * 10, page * 10)` — срез делается в `HomePage`, не в компоненте.

### Шаг 3 — `HomePage.tsx`: авторизованная зона

Добавить локальный стейт и логику:

```typescript
// Переключатель режима поиска для авторизованных
const [searchMode, setSearchMode] = useState<'scopus' | 'catalog'>('scopus');

// Локальная страница для Scopus-пагинации (сбрасывается при liveSize → 'all' и новом поиске)
const [livePage, setLivePage] = useState(1);
```

Логика отображения статей в Scopus-режиме:
```typescript
const displayedLiveArticles = liveSize === 'all'
  ? sortedLiveArticles
  : sortedLiveArticles.slice((livePage - 1) * 10, livePage * 10);
```

Структура JSX авторизованной зоны:
```
[Scopus | Collection]  ← таб-переключатель

Scopus-режим:
  SearchBar + ScopusQuotaBadge
  ArticleList(articles=displayedLiveArticles, isLoading=isLiveSearching, ...)
  ScopusPaginationBar(page=livePage, total=liveResults.length, liveSize=liveSize)

Collection-режим:
  SearchBar (отдельный handleCatalogSearch)
  ArticleList(...) ← те же props, что и в анонимном режиме
  (PaginationBar встроен в ArticleList уже)
```

`handleSizeChange` для `liveSize`:
```typescript
const handleLiveSizeModeChange = (s: 10 | 'all') => {
  setLiveSize(s);
  setLivePage(1);  // сбрасываем страницу при смене режима
};
```

### Шаг 4 — тесты

**`ScopusPaginationBar.test.tsx`** (unit, 5–6 тестов):
1. В режиме `liveSize='all'` страничный ряд не рендерится
2. В режиме `liveSize=10`, `total=5` (≤10) страничный ряд не рендерится
3. В режиме `liveSize=10`, `total=15` рендерятся страницы `[1][2]`
4. В режиме `liveSize=10`, `total=25` рендерятся ровно 3 страницы (cap)
5. Клик по `[2]` вызывает `onPageChange(2)`
6. Клик `Show all` вызывает `onSizeModeChange('all')`

**`HomePage.test.tsx`** (дополнение, 3–4 теста):
1. Авторизованный пользователь видит таб-переключатель `[Scopus | Collection]`
2. При переключении на Collection рендерится ArticleList с `PaginationBar`-пропсами из стора
3. В Scopus-режиме при `liveSize='all'` страничный ряд `ScopusPaginationBar` не виден
4. В Scopus-режиме при `liveSize=10` и 15 результатах видны кнопки страниц

***

## 4. План коммитов

```
feat(store): add liveSize / setLiveSize to articleStore for Scopus pagination control

feat(ui): add ScopusPaginationBar — size-mode toggle (10 / Show all) + 1-3 page counter

feat(home): wire catalog pagination and ScopusPaginationBar for authenticated users

test(pagination): unit tests for ScopusPaginationBar + HomePage auth-mode coverage
```

Четыре атомарных коммита. Каждый независимо компилируется: `ScopusPaginationBar` не импортирует `HomePage`, тесты идут последним коммитом поверх финального кода.
