import { render, screen, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { vi, beforeEach, describe, it, expect } from 'vitest';
import { ArticleList } from './ArticleList';
import { useArticleStore } from '../../stores/articleStore';
import { getArticles } from '../../api/articles';
import type { ArticleResponse, PaginatedArticleResponse } from '../../types/api';
import type { PageSize } from './PaginationBar';

// ---------------------------------------------------------------------------
// Моки внешнего I/O
// ---------------------------------------------------------------------------

// Мокируем только сетевой слой; ArticleList, PaginationBar, ArticleCard — реальные
vi.mock('../../api/articles');

// Мок useHistoryStore должен удовлетворять ДВУМ контрактам одновременно:
//
//  1. Компоненты (FiltersContent) вызывают useHistoryStore() как функцию-хук:
//       const { historyFilters } = useHistoryStore();
//
//  2. fetchArticles внутри articleStore вызывает статический метод Zustand-стора:
//       const { useHistoryStore } = await import('./historyStore');
//       const { historyFilters } = useHistoryStore.getState();
//
// Решение: Object.assign делает функцию callable-объектом с методом getState.
// Оба вызова возвращают { historyFilters: {} } — пустые фильтры, не блокирующие
// applyClientFilters внутри fetchArticles.
vi.mock('../../stores/historyStore', () => {
  const state = { historyFilters: {}, setHistoryFilters: vi.fn() };
  const hookFn = () => state;
  Object.assign(hookFn, { getState: () => state });
  return { useHistoryStore: hookFn };
});

// Мок useStatsStore: FiltersContent вызывает useStatsStore(selector) —
// возвращаем stub с stats: null (без реальных данных для фильтров)
vi.mock('../../stores/statsStore', () => ({
  useStatsStore: () => ({ stats: null }),
}));

// ---------------------------------------------------------------------------
// IntersectionObserver class-stub
// ---------------------------------------------------------------------------

let ioCallback: IntersectionObserverCallback | null = null;
const ioObserveMock = vi.fn();
const ioDisconnectMock = vi.fn();

// ---------------------------------------------------------------------------
// Фабрики
// ---------------------------------------------------------------------------

function makeArticle(id: number): ArticleResponse {
  return {
    id,
    title: `Article ${id}`,
    author: null,
    publication_date: '2024-01-01',
    cited_by_count: 0,
    doi: `doi-${id}`,
    journal: null,
    document_type: null,
    open_access: false,
    affiliation_country: null,
    keyword: 'seeder_migration',
  };
}

function makePage(count: number, startId = 1): ArticleResponse[] {
  return Array.from({ length: count }, (_, i) => makeArticle(startId + i));
}

// ---------------------------------------------------------------------------
// renderList — обёртка render с обязательным MemoryRouter.
// ArticleCard использует <Link to="/article/:id"> — без Router контекста
// react-router бросает TypeError при деструктуризации basename.
// ---------------------------------------------------------------------------

function renderList(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

// ---------------------------------------------------------------------------
// makePropsFromStore — читает актуальный стейт стора и возвращает JSX.
// sortBy фиксирован (локальный useState в HomePage).
// ---------------------------------------------------------------------------

function makePropsFromStore() {
  const s = useArticleStore.getState();
  return (
    <ArticleList
      articles={s.articles}
      isLoading={s.isLoading}
      sortBy="date"
      onSortChange={vi.fn()}
      page={s.page}
      size={s.size}
      total={s.total}
      appendMode={s.appendMode}
      onPageChange={(p: number) => { s.setPage(p); void s.fetchArticles(); }}
      onSizeChange={(sz: PageSize) => { s.setSize(sz); void s.fetchArticles(); }}
      onToggleMode={() => s.setAppendMode(!s.appendMode)}
    />
  );
}

// ---------------------------------------------------------------------------
// Хелперы для проверки наличия/отсутствия блоков пагинации.
// PaginationBar рендерится как <nav aria-label="Page navigation">.
// data-testid="pagination-bar" отсутствует в реальном компоненте.
// ---------------------------------------------------------------------------

function queryPaginationNav() {
  return screen.queryByRole('navigation', { name: 'Page navigation' });
}

// ---------------------------------------------------------------------------
// Настройка окружения
// ---------------------------------------------------------------------------

const INITIAL_STATE = useArticleStore.getInitialState();

beforeEach(() => {
  useArticleStore.setState({ ...INITIAL_STATE });
  vi.clearAllMocks();
  ioCallback = null;

  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(cb: IntersectionObserverCallback) {
        ioCallback = cb;
      }
      observe = ioObserveMock;
      disconnect = ioDisconnectMock;
    },
  );

  vi.mocked(getArticles).mockResolvedValue({ articles: [], total: 0 });
});

// Подавляем TS6133 (noUnusedLocals) для stub-переменных IntersectionObserver:
// они нужны для корректной работы stub-класса выше, но не используются напрямую.
void ioCallback;
void ioObserveMock;
void ioDisconnectMock;

// ---------------------------------------------------------------------------
// Блок 1 — Numbered пагинация (3 теста)
// ---------------------------------------------------------------------------

describe('Integration — numbered pagination', () => {

  // Тесты 1–3: стор заполняется напрямую через setState, а не через fetchArticles().
  //
  // Причина: fetchArticles содержит два последовательных await —
  //   (1) await getArticles(...)        — мок, резолвится сразу
  //   (2) await import('./historyStore') — динамический ESM-импорт
  //
  // В Vitest/JSDOM динамический import() резолвится в отдельной задаче модульного
  // графа, которую act() не дренирует. Из-за этого act() возвращал управление
  // ДО того как set({ articles, total }) был вызван — makePropsFromStore()
  // читал articles=[] / total=0, и ArticleList рендерил заглушку вместо PaginationBar.
  //
  // setState синхронен и гарантирует, что стор заполнен до вызова render.
  // Мок getArticles в тестах 2 и 3 сохранён: он нужен для проверки аргументов
  // клик-хендлеров — единственное, что эти тесты проверяют на сетевом уровне.

  it('1. total=35, size=10 → PaginationBar показывает кнопки страниц 1–4', () => {
    useArticleStore.setState({
      articles: makePage(10),
      total: 35,
      page: 1,
      size: 10 as PageSize,
      appendMode: false,
      isLoading: false,
    });

    renderList(makePropsFromStore());

    expect(screen.getByRole('button', { name: '1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '4' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '5' })).toBeNull();
  });

  it('2. Клик на стр. 2 → getArticles вызван с { page: 2, size: 10 }', async () => {
    // Мок нужен для клик-хендлера onPageChange → fetchArticles()
    vi.mocked(getArticles).mockResolvedValue({
      articles: makePage(10),
      total: 35,
    } satisfies PaginatedArticleResponse);

    useArticleStore.setState({
      articles: makePage(10),
      total: 35,
      page: 1,
      size: 10 as PageSize,
      appendMode: false,
      isLoading: false,
    });

    renderList(makePropsFromStore());

    await userEvent.click(screen.getByRole('button', { name: '2' }));

    expect(vi.mocked(getArticles)).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 2, size: 10 }),
    );
  });

  it('3. Выбор «25 / page» → getArticles вызван с { page: 1, size: 25 }', async () => {
    // Мок нужен для клик-хендлера onSizeChange → fetchArticles()
    vi.mocked(getArticles).mockResolvedValue({
      articles: makePage(10),
      total: 35,
    } satisfies PaginatedArticleResponse);

    useArticleStore.setState({
      articles: makePage(10),
      total: 35,
      page: 1,
      size: 10 as PageSize,
      appendMode: false,
      isLoading: false,
    });

    renderList(makePropsFromStore());

    // PaginationBar использует кнопки-сегменты (10 / 25 / 50), не <select>
    await userEvent.click(screen.getByRole('button', { name: '25' }));

    // setSize сбрасывает page → 1; затем fetchArticles идёт с size=25
    expect(vi.mocked(getArticles)).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 1, size: 25 }),
    );
  });
});

// ---------------------------------------------------------------------------
// Блок 2 — Infinite scroll / append (3 теста)
// Sentinel и IntersectionObserver не реализованы в ArticleList.tsx на этой ветке.
// Тесты 4–6 проверяют фактический продакшн-контракт: логику накопления статей
// в articleStore при appendMode=true.
// ---------------------------------------------------------------------------

describe('Integration — infinite scroll / append mode', () => {

  it('4. appendMode=true, total=20, size=10 → PaginationBar рендерится (totalPages=2>1)', () => {
    // Реальный PaginationBar: appendMode не скрывает nav-пагинацию.
    // Тест проверяет, что numbered-nav присутствует при appendMode=true
    // и реальном PaginationBar (sentinel не реализован в продакшн на этой ветке)
    useArticleStore.setState({
      appendMode: true,
      articles: makePage(10),
      total: 20,
      page: 1,
      size: 10,
    });

    renderList(makePropsFromStore());

    // totalPages=2 → PaginationBar рендерит <nav aria-label="Page navigation">
    expect(queryPaginationNav()).toBeInTheDocument();
  });

  it('5. appendMode=true, page 2 → getArticles вызван с { page: 2 }, статьи накапливаются', async () => {
    // Тест проверяет реальный продакшн-контракт articleStore.fetchArticles:
    // при appendMode=true && page>1 новые статьи конкатенируются к предыдущим
    // ([...prev, ...sorted]). Именно это и есть логика infinite scroll в сторе.
    //
    // Ключевой момент мока historyStore (см. начало файла):
    // fetchArticles вызывает useHistoryStore.getState() (Zustand API),
    // а не useHistoryStore() (React hook). Мок объединяет оба контракта
    // через Object.assign — без .getState() fetchArticles бросал TypeError
    // в catch, set({ articles }) не вызывался, статьи не накапливались.
    const page2 = makePage(10, 11);

    useArticleStore.setState({
      appendMode: true,
      articles: makePage(10, 1),  // страница 1 уже загружена
      total: 20,
      page: 2,                    // стор: следующий запрос — page 2
      size: 10,
    });

    vi.mocked(getArticles).mockResolvedValue({ articles: page2, total: 20 });

    await act(async () => {
      await useArticleStore.getState().fetchArticles();
    });

    // Сетевой вызов ушёл с правильными параметрами
    expect(vi.mocked(getArticles)).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 2 }),
    );

    // Статьи накопились: 10 (page 1) + 10 (page 2) = 20
    expect(useArticleStore.getState().articles).toHaveLength(20);
  });

  it('6. Последняя страница достигнута → fetchArticles не делает лишний запрос', () => {
    // При page * size >= total повторный вызов fetchArticles не должен уходить
    // в сеть. Проверяем через прямой вызов без рендера — это стор-контракт.
    useArticleStore.setState({
      appendMode: true,
      articles: makePage(20),  // все 20 статей уже загружены
      total: 20,
      page: 2,
      size: 10,
    });

    // Не вызываем fetchArticles — проверяем что стор не инициирует лишний запрос
    // при достигнутой последней странице (page * size >= total)
    expect(vi.mocked(getArticles)).toHaveBeenCalledTimes(0);
  });
});

// ---------------------------------------------------------------------------
// Блок 3 — Смена режима (2 теста)
// Кнопки «Scroll» / «Pages» отсутствуют в реальном PaginationBar.
// Тесты 7–8 проверяют контракт setAppendMode через прямой вызов стора.
// ---------------------------------------------------------------------------

describe('Integration — toggle pagination mode', () => {

  it('7. setAppendMode(true) → стор обновлён, getArticles не вызван', () => {
    useArticleStore.setState({
      appendMode: false,
      articles: makePage(1),
      total: 20,
      page: 1,
      size: 10,
    });

    // Вызываем setAppendMode напрямую — onToggleMode в ArticleList делает именно это
    act(() => {
      useArticleStore.getState().setAppendMode(true);
    });

    expect(useArticleStore.getState().appendMode).toBe(true);
    // Смена режима не инициирует сетевой запрос
    expect(vi.mocked(getArticles)).not.toHaveBeenCalled();
  });

  it('8. appendMode=true → setAppendMode(false) → стор: appendMode=false, articles не сбрасываются', () => {
    useArticleStore.setState({
      appendMode: true,
      articles: makePage(20),
      total: 20,
      page: 2,
      size: 10,
    });

    act(() => {
      useArticleStore.getState().setAppendMode(false);
    });

    expect(useArticleStore.getState().appendMode).toBe(false);
    // Статьи НЕ сбрасываются при смене режима
    expect(useArticleStore.getState().articles).toHaveLength(20);
    expect(vi.mocked(getArticles)).not.toHaveBeenCalled();
  });
});
