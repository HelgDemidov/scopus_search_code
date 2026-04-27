## Архитектурный план: пагинация в коллекции

### Предварительный аудит: что уже есть

Прежде чем планировать, зафиксируем **точный статус каждого компонента**:

**Бэкенд — `articles.py`** 

`GET /articles/` принимает `size: int = Query(10, ge=1, le=100)` — значения `size=25` и `size=100` работают **прямо сейчас без изменений**. Возвращает `PaginatedArticleResponse`, который содержит `total`. Бэкенд полностью готов.

**Типы — `types/api.ts`** 

`PaginatedArticleResponse` содержит `total: number`. `ArticleFilters` не содержит `page`/`size` — они существуют только в стейте стора, не в интерфейсе фильтров. Это **правильно**: `page`/`size` — параметры пагинации, а не фильтры.

**Стор — `articleStore.ts`** 

- `total: number` — хранится, приходит с сервера из `data.total`
- `page: number` (начальное `1`) и `size: number` (начальное `10`) — уже в стейте
- `setPage: (page: number) => set({ page })` — есть, но **не вызывает `fetchArticles`** автоматически. Вызывающий код должен сделать это сам после `setPage`
- `fetchArticles` всегда **заменяет** `articles` (нет append-логики для infinite scroll)
- **Проблема**: `size` сейчас жёстко равно `10` и нет `setSize`-экшена

**`ArticleList.tsx`** 

Компонент не знает ни о `total`, ни о `page`. Props: `articles`, `isLoading`, `sortBy`, `onSortChange`. Нет точек для пагинатора — нужно добавить.

**`HomePage.tsx`** 

Анонимный режим: `fetchArticles()` вызывается в `handleSearch`, но `page`/`total` из стора не читаются и не передаются в `ArticleList`. Пагинатор сюда не передаётся. Нужно пробросить.

**`ExplorePage.tsx`** 

Не содержит пагинацию статей — это аналитическая страница с `useSearchParams` для переключения режима. Паттерн `useSearchParams` + `Button` variant="outline"/"default" — хороший образец для **переключателя режима** `per-page` / `infinite`, но пагинатор статей здесь не образец.

***

### Решение по режимам пагинации

Для `ArticleList` нужны **два режима**, переключаемых пользователем:

| Режим | Когда использовать | Реализация |
|---|---|---|
| **Numbered pages** (по умолчанию) | Desktop, анонимный каталог | `PaginationBar` компонент |
| **Infinite scroll** | Мобайл, авторизованный browse | `IntersectionObserver` |

Infinite scroll через `IntersectionObserver` **не требует новых зависимостей** — он нативен в браузере и работает с React 18.3.1 через `useRef` + `useEffect`.  Пример паттерна: `ref` на sentinel-элемент после последней карточки, `useEffect` навешивает `observer`, при пересечении вызывает `setPage(page + 1)` + `fetchArticles()` с append-логикой в сторе.

***

### Список файлов с изменениями

```
frontend/src/
├── stores/articleStore.ts          ← [изменить] добавить setSize, appendMode, appendArticles
├── types/api.ts                    ← [не трогать] уже содержит total в PaginatedArticleResponse
├── components/articles/
│   ├── ArticleList.tsx             ← [изменить] принять page/total/size/onPageChange/mode props
│   └── PaginationBar.tsx           ← [НОВЫЙ] отдельный компонент
├── pages/HomePage.tsx              ← [изменить] пробросить page/total/setPage/setSize из стора
└── (ExplorePage.tsx)               ← [не трогать] не имеет отношения к статейной пагинации
```

***

## Пошаговый план изменений

### Шаг 1 — `articleStore.ts`: добавить `setSize` и append-режим

**Что добавить в интерфейс `ArticleStore`:**

```typescript
// Новые поля стейта
appendMode: boolean;                        // true → infinite scroll, false → numbered
setSize: (size: number) => void;            // переключатель размера страницы (10/25/50/100)
setAppendMode: (v: boolean) => void;        // переключатель режима пагинации
```

**Что изменить в `fetchArticles`:**

```typescript
// В блоке set({ articles: sorted, total: data.total ... }):
// Было:
set({ articles: sorted, total: data.total, isLoading: false });

// Стало:
const { appendMode, articles: prev } = get();
const merged = appendMode && page > 1
  ? [...prev, ...sorted]   // append для infinite scroll
  : sorted;                 // замена для numbered pages
set({ articles: merged, total: data.total, isLoading: false });
```

**Что добавить в экшены:**

```typescript
setSize: (size: number) => set({ size, page: 1 }),
setAppendMode: (v: boolean) => set({ appendMode: v, page: 1, articles: [] }),
```

> **Почему `articles: []` при смене режима?** Чтобы при переключении infinite→numbered не оставался накопленный список.

***

### Шаг 2 — `PaginationBar.tsx`: новый компонент

Нужен отдельный компонент — встраивать логику пагинатора прямо в `ArticleList` сделает его ответственным за слишком много вещей (нарушение SRP).

```typescript
interface PaginationBarProps {
  page: number;
  size: number;
  total: number;
  onPageChange: (p: number) => void;
  onSizeChange: (s: number) => void;
}
```

**Структура UI:**

```
[ ← Prev ]  [ 1 ] [2] [3] … [N]  [ Next → ]
                               Per page: [10▼] [25] [50]
```

Паттерн кнопок берём из `ExplorePage` — `Button` variant="outline"/"default" из `../ui/button`.  Для активной страницы — `variant="default"`, остальные — `variant="outline"`.

**Логика ellipsis** (упрощённая, без зависимостей):

```typescript
// Показываем: [1] ... [page-1] [page] [page+1] ... [lastPage]
// Максимум 7 элементов в строке
```

***

### Шаг 3 — `ArticleList.tsx`: новые props

**Что добавить в `ArticleListProps`:**

```typescript
interface ArticleListProps {
  articles: ArticleResponse[];
  isLoading: boolean;
  sortBy: 'date' | 'citations';
  onSortChange: (sort: 'date' | 'citations') => void;
  // --- пагинация ---
  page: number;
  size: number;
  total: number;
  appendMode: boolean;
  onPageChange: (p: number) => void;
  onSizeChange: (s: number) => void;
  onToggleMode: () => void;
}
```

**Точки вставки в JSX:**

1. **Перед `<div className="grid...">` (строка сортировки)** — добавить строку `{total} articles · режим-переключатель`:
   ```tsx
   <p className="text-xs text-slate-500">
     {total.toLocaleString('ru-RU')} статей
   </p>
   <button onClick={onToggleMode}>
     {appendMode ? 'Numbered pages' : 'Infinite scroll'}
   </button>
   ```

2. **После `<div className="grid...">` (после сетки карточек)** — либо `PaginationBar`, либо sentinel для infinite scroll:
   ```tsx
   {appendMode
     ? <div ref={sentinelRef} className="h-4" />  // sentinel для IntersectionObserver
     : <PaginationBar page={page} size={size} total={total}
         onPageChange={onPageChange} onSizeChange={onSizeChange} />
   }
   ```

3. **Sentinel-логика через `useRef`/`useEffect`** внутри `ArticleList`:
   ```typescript
   const sentinelRef = useRef<HTMLDivElement>(null);
   useEffect(() => {
     if (!appendMode) return;
     const el = sentinelRef.current;
     if (!el) return;
     const obs = new IntersectionObserver(([entry]) => {
       if (entry.isIntersecting && !isLoading) {
         const totalPages = Math.ceil(total / size);
         if (page < totalPages) onPageChange(page + 1);
       }
     }, { threshold: 0.1 });
     obs.observe(el);
     return () => obs.disconnect();
   }, [appendMode, isLoading, page, total, size, onPageChange]);
   ```

***

### Шаг 4 — `HomePage.tsx`: пробросить пагинацию

Из стора добавить:

```typescript
const {
  // ...существующие
  page, size, total,
  setPage, setSize, appendMode, setAppendMode,
} = useArticleStore();
```

И передать в `ArticleList` при анонимном режиме:

```tsx
<ArticleList
  articles={sortedArticles}
  isLoading={isLoading}
  sortBy={sortBy}
  onSortChange={setSortBy}
  // --- новые props ---
  page={page}
  size={size}
  total={total}
  appendMode={appendMode}
  onPageChange={(p) => { setPage(p); fetchArticles(); }}
  onSizeChange={(s) => { setSize(s); fetchArticles(); }}
  onToggleMode={() => setAppendMode(!appendMode)}
/>
```

> **Важно**: `setPage` **не вызывает `fetchArticles` автоматически**  — нужно делать это явно в `onPageChange`. Это существующее поведение стора, не баг.

***

## Нужен ли новый `PaginationBar` или достаточно расширить `ArticleList`?

**Нужен новый компонент.** Аргументы:

- `ArticleList` уже отвечает за рендер списка, скелетон и пустое состояние — пагинатор с ellipsis-логикой — это отдельная ответственность
- `PaginationBar` нужен изолированным для unit-тестирования (проверить `[1][2][3]…[N]` независимо от статей)
- В будущем он может понадобиться и на других страницах

Infinite scroll (`sentinel ref + IntersectionObserver`) — **остаётся внутри `ArticleList`**, потому что он неразрывно связан с `sentinelRef` на последний элемент сетки.

***

## Подтверждение: infinite scroll без зависимостей

**Да, React 18.3.1 + текущий стек поддерживает infinite scroll нативно** через `IntersectionObserver`. Паттерн: `useRef<HTMLDivElement>` → sentinel-элемент → `useEffect` с `new IntersectionObserver(...)` → `obs.disconnect()` в cleanup. Никаких `react-infinite-scroll-component`, `react-virtualized` и прочего не нужно. `IntersectionObserver` поддерживается во всех современных браузерах (Chrome 51+, Firefox 55+, Safari 12.1+). 

***

## Plan коммитов

```
feat(store): add setSize, appendMode, setAppendMode, append-logic in fetchArticles
feat(ui): add PaginationBar component with ellipsis and per-page selector
feat(articles): extend ArticleList props with pagination + IntersectionObserver sentinel
feat(home): wire pagination/infinite-scroll from articleStore to ArticleList on HomePage
```

Четыре атомарных коммита: каждый независимо тестируется и имеет смысл сам по себе. Бэкенд (`articles.py`) не требует изменений — `size=100` уже в пределах `le=100`. 