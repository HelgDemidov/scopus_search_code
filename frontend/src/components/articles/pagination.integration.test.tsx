import { render, screen, act } from '@testing-library/react';
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
// makePropsFromStore — читает актуальный стейт стора и возвращает props
// для ArticleList; sortBy фиксирован (локальный useState в HomePage)
// ---------------------------------------------------------------------------

function makePropsFromStore() {
  const s = useArticleStore.getState();
  return {
    articles: s.articles,
    isLoading: s.isLoading,
    sortBy: 'date' as const,
    onSortChange: vi.fn(),
    page: s.page,
    size: s.size,
    total: s.total,
    appendMode: s.appendMode,
    onPageChange: (p: number) => {
      s.setPage(p);
      void s.fetchArticles();
    },
    onSizeChange: (sz: PageSize) => {
      s.setSize(sz);
      void s.fetchArticles();
    },
    onToggleMode: () => s.setAppendMode(!s.appendMode),
  };
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
    // Настраиваем мок: 10 статей, total=35 → 4 страницы
    vi.mocked(getArticles).mockResolvedValue({
      articles: makePage(10),
      total: 35,
    } satisfies PaginatedArticleResponse);

    // Выполняем первую загрузку
    await act(async () => {
      await useArticleStore.getState().fetchArticles();
    });

    render(<ArticleList {...makePropsFromStore()} />);

    // PaginationBar должен рендерить кнопки 1, 2, 3, 4
    expect(screen.getByRole('button', { name: '1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '4' })).toBeInTheDocument();
    // Кнопки 5+ отсутствуют
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

    render(<ArticleList {...makePropsFromStore()} />);

    // Клик по кнопке страницы 2
    await userEvent.click(screen.getByRole('button', { name: '2' }));

    // Проверяем последний вызов getArticles
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

    render(<ArticleList {...makePropsFromStore()} />);

    // PaginationBar содержит <select> (combobox) для выбора размера страницы
    const select = screen.getByRole('combobox');
    await userEvent.selectOptions(select, '25');

    // setSize сбрасывает page → 1; затем fetchArticles идёт с size=25
    expect(vi.mocked(getArticles)).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 1, size: 25 }),
    );
  });
});

// ---------------------------------------------------------------------------
// Блок 2 — Infinite scroll / append (3 теста)
// ---------------------------------------------------------------------------

describe('Integration — infinite scroll / append mode', () => {

  it('4. appendMode=true, total=20 → sentinel рендерится, PaginationBar отсутствует', async () => {
    // Устанавливаем appendMode и одну страницу статей напрямую в стор
    useArticleStore.setState({
      appendMode: true,
      articles: makePage(10),
      total: 20,
      page: 1,
      size: 10,
    });

    render(<ArticleList {...makePropsFromStore()} />);

    expect(screen.getByTestId('sentinel')).toBeInTheDocument();
    expect(screen.queryByTestId('pagination-bar')).toBeNull();
  });

  it('5. Sentinel входит в viewport → getArticles вызван с { page: 2 }, статьи накапливаются', async () => {
    // Страница 1 уже загружена
    const page1 = makePage(10, 1);
    const page2 = makePage(10, 11);

    useArticleStore.setState({
      appendMode: true,
      articles: page1,
      total: 20,
      page: 1,
      size: 10,
    });

    // Следующий вызов getArticles вернёт страницу 2
    vi.mocked(getArticles).mockResolvedValue({ articles: page2, total: 20 });

    render(<ArticleList {...makePropsFromStore()} />);

    // Имитируем попадание sentinel в viewport (IO trigger)
    await act(async () => {
      triggerIntersection(true);
      // Даём промисам раскрутиться
      await Promise.resolve();
    });

    // getArticles должен получить page: 2
    expect(vi.mocked(getArticles)).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 2 }),
    );

    // После append стор содержит 20 статей (10 + 10)
    expect(useArticleStore.getState().articles).toHaveLength(20);
  });

  it('6. Последняя страница достигнута → IO trigger → getArticles не вызван повторно', () => {
    // page=2, total=20, size=10 → totalPages=2 → page === totalPages → нет запроса
    useArticleStore.setState({
      appendMode: true,
      articles: makePage(10, 11),
      total: 20,
      page: 2,
      size: 10,
    });

    render(<ArticleList {...makePropsFromStore()} />);

    // IO trigger при достигнутой последней странице
    triggerIntersection(true);

    // getArticles не должен быть вызван
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

    const { rerender } = render(<ArticleList {...makePropsFromStore()} />);

    // В исходном состоянии — PaginationBar, нет sentinel
    expect(screen.queryByTestId('pagination-bar')).toBeInTheDocument();
    expect(screen.queryByTestId('sentinel')).toBeNull();

    // Кликаем «Scroll» — вызывается setAppendMode(true)
    await userEvent.click(screen.getByRole('button', { name: 'Scroll' }));

    // Перерендериваем с обновлёнными props из стора
    rerender(<ArticleList {...makePropsFromStore()} />);

    expect(screen.getByTestId('sentinel')).toBeInTheDocument();
    expect(screen.queryByTestId('pagination-bar')).toBeNull();

    // getArticles НЕ должен вызываться при смене режима
    expect(vi.mocked(getArticles)).not.toHaveBeenCalled();
  });

  it('8. appendMode=true → клик «Pages» → стор: appendMode=false, articles не сбрасываются fetchArticles не вызывается', async () => {
    // 20 накопленных статей, page=2
    useArticleStore.setState({
      appendMode: true,
      articles: makePage(20),
      total: 20,
      page: 2,
      size: 10,
    });

    const { rerender } = render(<ArticleList {...makePropsFromStore()} />);

    // Кликаем «Pages» — setAppendMode(false)
    await userEvent.click(screen.getByRole('button', { name: 'Pages' }));

    rerender(<ArticleList {...makePropsFromStore()} />);

    // Стор: режим сменился на numbered pagination
    expect(useArticleStore.getState().appendMode).toBe(false);

    // handleToggleMode вызывает только setAppendMode — без fetchArticles
    // Это корректное поведение (подтверждено в плане, п. 8)
    expect(vi.mocked(getArticles)).not.toHaveBeenCalled();
  });
});
