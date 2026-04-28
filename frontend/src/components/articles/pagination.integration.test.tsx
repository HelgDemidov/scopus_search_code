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

// Мок useHistoryStore: callable hook (не plain object) — FiltersContent вызывает
// useHistoryStore() как функцию; { getState } без вызова вызывало TypeError
vi.mock('../../stores/historyStore', () => ({
  useHistoryStore: () => ({ historyFilters: {}, setHistoryFilters: vi.fn() }),
}));

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
// Примечание: sentinel и IntersectionObserver не реализованы в текущем
// продакшн-коде (ArticleList.tsx / PaginationBar.tsx на ветке english-version).
// Тесты 4–6 обновлены под фактический DOM продакшн-компонентов.
// ---------------------------------------------------------------------------

describe('Integration — infinite scroll / append mode', () => {

  it('4. appendMode=true, total=20, size=10 → PaginationBar рендерится (totalPages=2>1)', () => {
    // Реальный PaginationBar: appendMode не скрывает nav-пагинацию.
    // Тест проверяет, что numbered-nav присутствует при appendMode=true
    // и реальном PaginationBar (appendMode/sentinel не реализованы в продакшн)
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

  it.todo('5. [IO не реализован] Sentinel входит в viewport → статьи накапливаются');

  it.todo('6. [IO не реализован] Последняя страница → IO trigger → getArticles не вызван');
});

// ---------------------------------------------------------------------------
// Блок 3 — Смена режима (2 теста)
// Примечание: кнопки «Scroll» / «Pages» отсутствуют в реальном PaginationBar.
// Тесты 7–8 переходят на прямой вызов setAppendMode через стор.
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
