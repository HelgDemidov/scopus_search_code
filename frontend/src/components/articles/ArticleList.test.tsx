import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, beforeEach, describe, it, expect } from 'vitest';
import { ArticleList } from './ArticleList';
import type { ArticleResponse } from '../../types/api';

// Тип props компонента выводим из сигнатуры самого компонента —
// ArticleListProps не экспортирован из модуля, поэтому используем Parameters<>
type ArticleListProps = Parameters<typeof ArticleList>[0];

// ---------------------------------------------------------------------------
// Моки модулей — объявляем ДО импорта тестируемого модуля
// ---------------------------------------------------------------------------

// Мок ArticleFilters: ArticleList встраивает оба компонента напрямую.
// Заменяем реальные компоненты на stub, чтобы изолировать юнит-тест
// от Zustand-сторов (useHistoryStore, useStatsStore) и Radix Sheet.
// ArticleFiltersSidebar — захватываем open/onToggle, ArticleList рендерит его
// из 3 разных условных веток ниже (skeleton/empty/results) и должен
// прокидывать filtersOpen/onToggleFilters во все три одинаково (регрессия
// 2026-08-03 — раньше состояние раскрытия жило локально в самом сайдбаре и
// сбрасывалось при переключении между этими ветками).
let capturedSidebarProps: Record<string, unknown> = {};
vi.mock('./ArticleFilters', () => ({
  ArticleFiltersSidebar: (props: Record<string, unknown>) => {
    capturedSidebarProps = props;
    return <div data-testid="filters-sidebar" />;
  },
  ArticleFiltersMobile: () => <div data-testid="filters-mobile" />,
}));

// Мок useHistoryStore: FiltersContent вызывает его как хук-функцию.
// Возвращаем callable hook, а не plain object — иначе TypeError при вызове useHistoryStore().
vi.mock('../../stores/historyStore', () => ({
  useHistoryStore: () => ({ historyFilters: {}, setHistoryFilters: vi.fn() }),
}));

// Мок useStatsStore: FiltersContent также вызывает useStatsStore(selector).
vi.mock('../../stores/statsStore', () => ({
  useStatsStore: () => ({ stats: null }),
}));

// Заменяем PaginationBar на stub с data-testid и захватом props.
// Stub рендерит кнопку-тоггл «Среол / Pages» и sentinel,
// чтобы юнит-тесты могли проверить onToggleMode и appendMode без реального PaginationBar.
let capturedPaginationProps: Record<string, unknown> = {};
vi.mock('./PaginationBar', () => ({
  PaginationBar: (props: Record<string, unknown>) => {
    capturedPaginationProps = props;
    const appendMode = props.appendMode as boolean;
    const onToggleMode = props.onToggleMode as () => void;
    return (
      <div data-testid="pagination-bar">
        {!appendMode && (
          <button onClick={onToggleMode}>Scroll</button>
        )}
        {appendMode && (
          <>
            <button onClick={onToggleMode}>Pages</button>
            <div data-testid="sentinel" />
          </>
        )}
      </div>
    );
  },
}));

// Заменяем ArticleCard — нам важно проверить, что карточка рендерится, без API-зависимостей
vi.mock('./ArticleCard', () => ({
  ArticleCard: ({ article }: { article: ArticleResponse }) => (
    <div data-testid="article-card">{article.title}</div>
  ),
}));

// ---------------------------------------------------------------------------
// Вспомогательные фабрики
// ---------------------------------------------------------------------------

// Фабрика статьи — только поля, реально существующие в ArticleResponse
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

// Фабрика полного набора props — возвращаемый тип ArticleListProps фиксирует
// size как PageSize (10 | 25 | 50), исключая widening до number
function makeProps(overrides: Partial<ArticleListProps> = {}): ArticleListProps {
  return {
    articles: [] as ArticleResponse[],
    isLoading: false,
    hasSearched: true,
    sortBy: 'date' as const,
    onSortChange: vi.fn(),
    page: 1,
    size: 10,
    total: 0,
    totalIsCapped: false,
    appendMode: false,
    onPageChange: vi.fn(),
    onSizeChange: vi.fn(),
    onToggleMode: vi.fn(),
    filtersOpen: false,
    onToggleFilters: vi.fn(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// IntersectionObserver мок — остается для совместимости с beforeEach;
// IO-логика тестируется в pagination.integration.test.tsx
// ---------------------------------------------------------------------------

const ioObserveMock = vi.fn();
const ioDisconnectMock = vi.fn();

beforeEach(() => {
  capturedPaginationProps = {};
  capturedSidebarProps = {};
  vi.clearAllMocks();

  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor() {}
      observe = ioObserveMock;
      disconnect = ioDisconnectMock;
    },
  );
});

// ---------------------------------------------------------------------------
// Блок 1: Счётчик и переключатель режима
// ---------------------------------------------------------------------------

describe('ArticleList — счетчик и переключатель режима', () => {

  it('total=0 — счетчик и кнопка-переключатель не рендерятся', () => {
    render(<ArticleList {...makeProps({ total: 0 })} />);
    // При total=0 articles=[] → empty-state branch (без шапки со счётчиком)
    expect(screen.queryByText(/\d.*results/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /Scroll|Pages/i })).toBeNull();
  });

  it('total=150 — счетчик отображает количество статей', () => {
    // articles не пусты и !isLoading → main branch с счетчиком
    render(<ArticleList {...makeProps({ total: 150, articles: [makeArticle(1)] })} />);
    // Продакшн: {total.toLocaleString('en-US')} results → «150 results»
    expect(screen.getByText(/150/)).toBeInTheDocument();
  });

  it('totalIsCapped=true — счетчик показывает "N+" вместо точного числа', () => {
    render(
      <ArticleList
        {...makeProps({ total: 2000, totalIsCapped: true, articles: [makeArticle(1)] })}
      />,
    );
    expect(screen.getByText('2000+ results')).toBeInTheDocument();
  });

  it('total>0, appendMode=false — кнопка показывает «Scroll»', () => {
    render(<ArticleList {...makeProps({ total: 50, appendMode: false, articles: [makeArticle(1)] })} />);
    expect(screen.getByRole('button', { name: 'Scroll' })).toBeInTheDocument();
  });

  it('total>0, appendMode=true — кнопка показывает «Pages»', () => {
    render(<ArticleList {...makeProps({ total: 50, appendMode: true, articles: [makeArticle(1)] })} />);
    expect(screen.getByRole('button', { name: 'Pages' })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Блок 4: Пустое состояние — сообщение только после реального поиска
// ---------------------------------------------------------------------------

describe('ArticleList — empty state / hasSearched', () => {
  it('hasSearched=false, articles=[] — "No articles found" не рендерится, кнопка фильтров видна', () => {
    render(<ArticleList {...makeProps({ hasSearched: false, total: 0 })} />);
    expect(screen.queryByText('No articles found')).toBeNull();
    expect(screen.getByTestId('filters-sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('filters-mobile')).toBeInTheDocument();
  });

  it('hasSearched=true, articles=[] — рендерится "No articles found"', () => {
    render(<ArticleList {...makeProps({ hasSearched: true, total: 0 })} />);
    expect(screen.getByText('No articles found')).toBeInTheDocument();
    expect(screen.getByText('Try a different search query.')).toBeInTheDocument();
  });

  it('isLoading=true, hasSearched=false — скелетон рендерится без "No articles found"', () => {
    render(<ArticleList {...makeProps({ hasSearched: false, isLoading: true, articles: [] })} />);
    expect(screen.queryByText('No articles found')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Блок 2: Режим пагинации vs sentinel
// ---------------------------------------------------------------------------

describe('ArticleList — режим пагинации', () => {

  it('appendMode=false, articles>0, !isLoading — рендерится PaginationBar', () => {
    render(
      <ArticleList
        {...makeProps({
          appendMode: false,
          articles: [makeArticle(1)],
          isLoading: false,
          total: 20,
        })}
      />,
    );
    expect(screen.getByTestId('pagination-bar')).toBeInTheDocument();
    // В режиме appendMode=false stub рендерит только кнопку Scroll, sentinel отсутствует
    expect(screen.queryByTestId('sentinel')).toBeNull();
  });

  it('appendMode=true, articles>0, !isLoading — рендерится sentinel, PaginationBar присутствует', () => {
    render(
      <ArticleList
        {...makeProps({
          appendMode: true,
          articles: [makeArticle(1)],
          isLoading: false,
          total: 20,
        })}
      />,
    );
    expect(screen.getByTestId('sentinel')).toBeInTheDocument();
    // Стуб pagination-bar рендерится всегда, проверяем отсутствие настоящего nav
    expect(screen.queryByRole('navigation')).toBeNull();
  });

  it('isLoading=true, articles=[] — ни PaginationBar, ни sentinel не рендерятся', () => {
    // isLoading=true + articles=[] → скелетон-ветка: PaginationBar не монтируется
    render(
      <ArticleList
        {...makeProps({
          isLoading: true,
          articles: [],
          total: 20,
        })}
      />,
    );
    expect(screen.queryByTestId('pagination-bar')).toBeNull();
    expect(screen.queryByTestId('sentinel')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Блок 3: Callbacks
// ---------------------------------------------------------------------------

describe('ArticleList — callbacks', () => {

  it('клик по «Scroll» вызывает onToggleMode', async () => {
    const onToggleMode = vi.fn();
    render(
      <ArticleList
        {...makeProps({ total: 50, appendMode: false, articles: [makeArticle(1)], onToggleMode })}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Scroll' }));
    expect(onToggleMode).toHaveBeenCalledTimes(1);
  });

  it('PaginationBar получает правильные props: page, size, total, onPageChange, onSizeChange', () => {
    const onPageChange = vi.fn();
    const onSizeChange = vi.fn();
    render(
      <ArticleList
        {...makeProps({
          appendMode: false,
          articles: [makeArticle(1)],
          page: 2,
          size: 25,
          total: 100,
          onPageChange,
          onSizeChange,
        })}
      />,
    );
    expect(capturedPaginationProps.page).toBe(2);
    expect(capturedPaginationProps.size).toBe(25);
    expect(capturedPaginationProps.total).toBe(100);
    expect(capturedPaginationProps.onPageChange).toBe(onPageChange);
    expect(capturedPaginationProps.onSizeChange).toBe(onSizeChange);
  });

  it('клик «By citations» вызывает onSortChange(«citations»)', async () => {
    const onSortChange = vi.fn();
    // articles > 0 → main branch → кнопки сортировки рендерятся
    render(<ArticleList {...makeProps({ onSortChange, articles: [makeArticle(1)], total: 10 })} />);
    await userEvent.click(screen.getByRole('button', { name: 'By citations' }));
    expect(onSortChange).toHaveBeenCalledWith('citations');
  });
});

// ---------------------------------------------------------------------------
// Блок 5: filtersOpen/onToggleFilters прокидываются во ArticleFiltersSidebar
// одинаково из всех 3 условных JSX-веток (регрессия 2026-08-03 — раньше
// ArticleFiltersSidebar сам владел open через local useState, и переключение
// между этими ветками при поиске — skeleton → results — размонтировало и
// заново монтировало компонент, сбрасывая open в false)
// ---------------------------------------------------------------------------

describe('ArticleList — filtersOpen прокидывается во всех 3 ветках рендера', () => {
  it('skeleton-ветка (isLoading=true, articles=[]): filtersOpen=true доходит до сайдбара', () => {
    render(<ArticleList {...makeProps({ isLoading: true, articles: [], filtersOpen: true })} />);
    expect(capturedSidebarProps.open).toBe(true);
  });

  it('empty-ветка (!isLoading, articles=[]): filtersOpen=true доходит до сайдбара', () => {
    render(<ArticleList {...makeProps({ isLoading: false, articles: [], filtersOpen: true })} />);
    expect(capturedSidebarProps.open).toBe(true);
  });

  it('results-ветка (articles>0): filtersOpen=true доходит до сайдбара', () => {
    render(<ArticleList {...makeProps({ articles: [makeArticle(1)], total: 1, filtersOpen: true })} />);
    expect(capturedSidebarProps.open).toBe(true);
  });

  it('переключение skeleton → results с тем же filtersOpen=true (имитация: поиск завершился) — open остаётся true во всех рендерах', () => {
    const onToggleFilters = vi.fn();
    const { rerender } = render(
      <ArticleList {...makeProps({ isLoading: true, articles: [], filtersOpen: true, onToggleFilters })} />,
    );
    expect(capturedSidebarProps.open).toBe(true);

    // Поиск завершился: isLoading=false, пришли статьи — другая условная ветка
    rerender(
      <ArticleList
        {...makeProps({ isLoading: false, articles: [makeArticle(1)], total: 1, filtersOpen: true, onToggleFilters })}
      />,
    );
    // До фикса ArticleFiltersSidebar сам инициализировал бы open=false здесь —
    // теперь значение целиком приходит через prop и не зависит от remount
    expect(capturedSidebarProps.open).toBe(true);
  });

  it('onToggleFilters, переданный в ArticleList, доходит до сайдбара как onToggle', () => {
    const onToggleFilters = vi.fn();
    render(<ArticleList {...makeProps({ articles: [makeArticle(1)], total: 1, onToggleFilters })} />);
    expect(capturedSidebarProps.onToggle).toBe(onToggleFilters);
  });
});
