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
// Моки внешнего I/O — только два: сетевой вызов и динамический импорт стора
// ---------------------------------------------------------------------------

// Мокируем только сетевой слой; ArticleList, PaginationBar, ArticleCard — реальные
vi.mock('../../api/articles');

// Мокируем динамический импорт historyStore, используемый внутри fetchArticles
vi.mock('../../stores/historyStore', () => ({
  useHistoryStore: {
    getState: () => ({ historyFilters: {} }),
  },
}));

// ---------------------------------------------------------------------------
// IntersectionObserver class-stub (идентично ArticleList.test.tsx)
// ---------------------------------------------------------------------------

let ioCallback: IntersectionObserverCallback | null = null;
const ioObserveMock = vi.fn();
const ioDisconnectMock = vi.fn();

// ---------------------------------------------------------------------------
// Фабрики
// ---------------------------------------------------------------------------

// Фабрика статьи — поля точно совпадают с ArticleResponse (нет лишних полей)
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

// Фабрика страницы из N статей
function makePage(count: number, startId = 1): ArticleResponse[] {
  return Array.from({ length: count }, (_, i) => makeArticle(startId + i));
}

// ---------------------------------------------------------------------------
// renderList — обёртка render с обязательным MemoryRouter.
// ArticleCard рендерится реальным (интеграция!) и использует <Link to="/article/:id">.
// Без Router-контекста react-router бросает TypeError при деструктуризации basename.
// ---------------------------------------------------------------------------

function renderList(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

// ---------------------------------------------------------------------------
// makePropsFromStore — читает актуальный стейт стора и возвращает JSX
// для ArticleList; sortBy фиксирован (локальный useState в HomePage)
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
// PaginationBar рендерится как <nav aria-label="Page navigation"> —
// data-testid="pagination-bar" в реальном компоненте отсутствует.
// ---------------------------------------------------------------------------

function queryPaginationNav() {
  return screen.queryByRole('navigation', { name: 'Page navigation' });
}

// ---------------------------------------------------------------------------
// Настройка окружения
// ---------------------------------------------------------------------------

// Снепшот начального состояния стора — берём до beforeEach, один раз
const INITIAL_STATE = useArticleStore.getInitialState();

beforeEach(() => {
  // Сбрасываем стор в чистое состояние
  useArticleStore.setState({ ...INITIAL_STATE });
  vi.clearAllMocks();
  ioCallback = null;

  // Глобальный stub IntersectionObserver — требует конструктор (не стрелочную функцию)
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

  // По умолчанию getArticles возвращает пустой ответ
  vi.mocked(getArticles).mockResolvedValue({ articles: [], total: 0 });
});

// Хелпер: имитируем попадание sentinel в viewport
function triggerIntersection(isIntersecting: boolean) {
  ioCallback?.(
    [{ isIntersecting } as IntersectionObserverEntry],
    {} as IntersectionObserver,
  );
}

// ---------------------------------------------------------------------------
// Блок 1 — Numbered пагинация (3 теста)
// ---------------------------------------------------------------------------

describe('Integration — numbered pagination', () => {

  it('1. total=35, size=10 → PaginationBar показывает кнопки страниц 1–4', async () => {
    vi.mocked(getArticles).mockResolvedValue({
      articles: makePage(10),
      total: 35,
    } satisfies PaginatedArticleResponse);

    await act(async () => {
      await useArticleStore.getState().fetchArticles();
    });

    renderList(makePropsFromStore());

    expect(screen.getByRole('button', { name: '1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '4' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '5' })).toBeNull();
  });

  it('2. Клик на стр. 2 → getArticles вызван с { page: 2, size: 10 }', async () => {
    vi.mocked(getArticles).mockResolvedValue({
      articles: makePage(10),
      total: 35,
    });

    await act(async () => {
      await useArticleStore.getState().fetchArticles();
    });

    renderList(makePropsFromStore());

    await userEvent.click(screen.getByRole('button', { name: '2' }));

    expect(vi.mocked(getArticles)).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 2, size: 10 }),
    );
  });

  it('3. Выбор «25 / page» → getArticles вызван с { page: 1, size: 25 }', async () => {
    vi.mocked(getArticles).mockResolvedValue({
      articles: makePage(10),
      total: 35,
    });

    await act(async () => {
      await useArticleStore.getState().fetchArticles();
    });

    renderList(makePropsFromStore());

    // PaginationBar использует кнопки-сегменты (10 / 25 / 50), а не <select>.
    // Кликаем по кнопке «25» в группе «Строк на странице»
    await userEvent.click(screen.getByRole('button', { name: '25' }));

    // setSize сбрасывает page → 1; затем fetchArticles идет с size=25
    expect(vi.mocked(getArticles)).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 1, size: 25 }),
    );
  });
});

// ---------------------------------------------------------------------------
// Блок 2 — Infinite scroll / append (3 теста)
// ---------------------------------------------------------------------------

describe('Integration — infinite scroll / append mode', () => {

  it('4. appendMode=true, total=20 → sentinel рендерится, PaginationBar отсутствует', () => {
    useArticleStore.setState({
      appendMode: true,
      articles: makePage(10),
      total: 20,
      page: 1,
      size: 10,
    });

    renderList(makePropsFromStore());

    expect(screen.getByTestId('sentinel')).toBeInTheDocument();
    expect(queryPaginationNav()).toBeNull();
  });

  it('5. Sentinel входит в viewport → getArticles вызван с { page: 2 }, статьи накапливаются', async () => {
    const page1 = makePage(10, 1);
    const page2 = makePage(10, 11);

    useArticleStore.setState({
      appendMode: true,
      articles: page1,
      total: 20,
      page: 1,
      size: 10,
    });

    vi.mocked(getArticles).mockResolvedValue({ articles: page2, total: 20 });

    renderList(makePropsFromStore());

    await act(async () => {
      triggerIntersection(true);
      await Promise.resolve();
    });

    expect(vi.mocked(getArticles)).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 2 }),
    );

    expect(useArticleStore.getState().articles).toHaveLength(20);
  });

  it('6. Последняя страница достигнута → IO trigger → getArticles не вызван повторно', () => {
    useArticleStore.setState({
      appendMode: true,
      articles: makePage(10, 11),
      total: 20,
      page: 2,
      size: 10,
    });

    renderList(makePropsFromStore());

    triggerIntersection(true);

    expect(vi.mocked(getArticles)).toHaveBeenCalledTimes(0);
  });
});

// ---------------------------------------------------------------------------
// Блок 3 — Смена режима (2 теста)
// ---------------------------------------------------------------------------

describe('Integration — toggle pagination mode', () => {

  it('7. appendMode=false → клик «Scroll» → sentinel появляется, PaginationBar исчезает', async () => {
    useArticleStore.setState({
      appendMode: false,
      articles: makePage(1),
      total: 20,
      page: 1,
      size: 10,
    });

    const { rerender } = renderList(makePropsFromStore());

    // Проверяем начальное состояние: nav-пагинация есть, sentinel отсутствует
    expect(queryPaginationNav()).toBeInTheDocument();
    expect(screen.queryByTestId('sentinel')).toBeNull();

    // Кликаем «Scroll» — вызывается setAppendMode(true)
    await userEvent.click(screen.getByRole('button', { name: 'Scroll' }));

    // rerender сохраняет существующий MemoryRouter-контекст
    rerender(
      <MemoryRouter>
        {makePropsFromStore()}
      </MemoryRouter>,
    );

    // После смены режима: sentinel появился, nav-пагинация исчезла
    expect(screen.getByTestId('sentinel')).toBeInTheDocument();
    expect(queryPaginationNav()).toBeNull();

    // getArticles НЕ должен вызываться при смене режима
    expect(vi.mocked(getArticles)).not.toHaveBeenCalled();
  });

  it('8. appendMode=true → клик «Pages» → стор: appendMode=false, articles не сбрасываются fetchArticles не вызывается', async () => {
    useArticleStore.setState({
      appendMode: true,
      articles: makePage(20),
      total: 20,
      page: 2,
      size: 10,
    });

    const { rerender } = renderList(makePropsFromStore());

    // Кликаем «Pages» — setAppendMode(false)
    await userEvent.click(screen.getByRole('button', { name: 'Pages' }));

    rerender(
      <MemoryRouter>
        {makePropsFromStore()}
      </MemoryRouter>,
    );

    // Стор: режим сменился на numbered pagination
    expect(useArticleStore.getState().appendMode).toBe(false);

    // handleToggleMode вызывает только setAppendMode — без fetchArticles
    expect(vi.mocked(getArticles)).not.toHaveBeenCalled();
  });
});
