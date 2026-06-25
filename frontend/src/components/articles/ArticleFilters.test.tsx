// Тесты для ArticleFilters — рефакторинг filtering-2:
//   режимная логика (catalog/scopus), Popover+Command, debounce, badge «Filters changed»

import { render, screen, fireEvent, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ArticleResponse, ArticleClientFilters, StatsResponse, SearchMode } from '../../types/api';

// ---------------------------------------------------------------------------
// vi.hoisted — мутируемые объекты состояния, доступные в фабриках vi.mock
// ---------------------------------------------------------------------------

const { articleState, historyState, statsState } = vi.hoisted(() => {
  const articleState: {
    searchMode: SearchMode;
    fetchArticles: ReturnType<typeof vi.fn>;
    setPage: ReturnType<typeof vi.fn>;
    liveResults: ArticleResponse[];
  } = {
    searchMode: 'catalog',
    fetchArticles: vi.fn(),
    setPage: vi.fn(),
    liveResults: [],
  };

  const historyState: {
    historyFilters: ArticleClientFilters;
    setHistoryFilters: ReturnType<typeof vi.fn>;
    resetFilters: ReturnType<typeof vi.fn>;
  } = {
    historyFilters: {},
    setHistoryFilters: vi.fn(),
    resetFilters: vi.fn(),
  };

  const statsState: { stats: StatsResponse | null } = { stats: null };

  return { articleState, historyState, statsState };
});

// ---------------------------------------------------------------------------
// Моки Radix-компонентов с порталами — заменяем на детерминированные заглушки
// ---------------------------------------------------------------------------

// Popover: PopoverContent рендерится всегда (не через портал),
// тесты видят CommandItem без симуляции открытия дропдауна
vi.mock('../ui/popover', () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverTrigger: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) =>
    asChild ? <>{children}</> : <div>{children}</div>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="popover-content">{children}</div>
  ),
}));

// Command: CommandItem вызывает onSelect при клике — имитирует поведение cmdk
vi.mock('../ui/command', () => ({
  Command: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CommandInput: ({ placeholder }: { placeholder?: string }) => <input placeholder={placeholder} />,
  CommandList: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CommandEmpty: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CommandGroup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CommandItem: ({
    children,
    onSelect,
    value,
  }: {
    children?: React.ReactNode;
    onSelect?: (value: string) => void;
    value?: string;
    'data-checked'?: string;
  }) => (
    <button
      type="button"
      data-testid={`item-${value ?? String(children)}`}
      onClick={() => onSelect?.(value ?? '')}
    >
      {children}
    </button>
  ),
}));

// Sheet: рендерим без портала — SheetContent всегда видим
vi.mock('../ui/sheet', () => ({
  Sheet: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SheetTrigger: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) =>
    asChild ? <>{children}</> : <div>{children}</div>,
  SheetContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// Checkbox: кнопка с onClick — надёжнее <input type="checkbox"> в jsdom.
// fireEvent.change на контролируемом React-checkbox не гарантированно срабатывает,
// поэтому эмулируем через onClick, который вызывает onCheckedChange(!checked).
vi.mock('../ui/checkbox', () => ({
  Checkbox: ({
    checked,
    onCheckedChange,
  }: {
    checked?: boolean;
    onCheckedChange?: (checked: boolean) => void;
  }) => (
    <button
      type="button"
      role="checkbox"
      aria-checked={!!checked}
      data-testid="oa-checkbox"
      onClick={() => onCheckedChange?.(!checked)}
    />
  ),
}));

// ---------------------------------------------------------------------------
// Моки сторов
// ---------------------------------------------------------------------------

// useArticleStore вызывается с selector-функцией: (s) => s.searchMode
vi.mock('../../stores/articleStore', () => ({
  useArticleStore: (sel?: (s: typeof articleState) => unknown) =>
    sel ? sel(articleState) : articleState,
}));

// useHistoryStore вызывается без selector: const { historyFilters, ... } = useHistoryStore()
vi.mock('../../stores/historyStore', () => ({
  useHistoryStore: () => historyState,
}));

// useStatsStore вызывается с selector-функцией: (s) => s.stats
vi.mock('../../stores/statsStore', () => ({
  useStatsStore: (sel?: (s: typeof statsState) => unknown) =>
    sel ? sel(statsState) : statsState,
}));

// ---------------------------------------------------------------------------
// Импорт тестируемого модуля — ПОСЛЕ vi.mock
// ---------------------------------------------------------------------------

import { ArticleFiltersSidebar } from './ArticleFilters';

// ---------------------------------------------------------------------------
// Вспомогательные данные
// ---------------------------------------------------------------------------

const MOCK_STATS: StatsResponse = {
  total_articles: 100,
  total_journals: 20,
  total_countries: 10,
  open_access_count: 30,
  by_year: [
    { label: '2018', count: 3 },
    { label: '2023', count: 10 },
  ],
  by_country: [
    { label: 'Russia', count: 3 },
    { label: 'USA', count: 7 },
  ],
  by_doc_type: [
    { label: 'Article', count: 8 },
    { label: 'Review', count: 2 },
  ],
  by_journal: [],
  top_keywords: [],
};

function makeArticle(id: number): ArticleResponse {
  return {
    id,
    title: `Article ${id}`,
    author: null,
    publication_date: '2024-01-01',
    cited_by_count: 0,
    doi: null,
    journal: null,
    document_type: null,
    open_access: false,
    affiliation_country: null,
    keyword: 'test',
  };
}

// ---------------------------------------------------------------------------
// beforeEach — сброс состояния между тестами
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();

  articleState.searchMode = 'catalog';
  articleState.fetchArticles = vi.fn();
  articleState.setPage = vi.fn();
  articleState.liveResults = [];

  historyState.historyFilters = {};
  historyState.setHistoryFilters = vi.fn();
  historyState.resetFilters = vi.fn();

  statsState.stats = null;
});

function renderFilters() {
  return render(<ArticleFiltersSidebar />);
}

// ===========================================================================
// Блок 1: базовый рендер
// ===========================================================================

describe('базовый рендер', () => {
  it('показывает year inputs и OA checkbox', () => {
    renderFilters();
    expect(screen.getByLabelText('Year from')).toBeInTheDocument();
    expect(screen.getByLabelText('Year to')).toBeInTheDocument();
    expect(screen.getByTestId('oa-checkbox')).toBeInTheDocument();
  });

  it('нет badge «Filters changed» в catalog-режиме изначально', () => {
    renderFilters();
    expect(screen.queryByText(/filters changed/i)).not.toBeInTheDocument();
  });

  it('нет badge «Filters changed» в scopus-режиме изначально', () => {
    articleState.searchMode = 'scopus';
    renderFilters();
    expect(screen.queryByText(/filters changed/i)).not.toBeInTheDocument();
  });

  it('кнопка Clear filters скрыта, когда нет активных фильтров', () => {
    renderFilters();
    expect(screen.queryByRole('button', { name: /clear filters/i })).not.toBeInTheDocument();
  });

  it('кнопка Clear filters видна при наличии активного фильтра', () => {
    historyState.historyFilters = { openAccessOnly: true };
    renderFilters();
    expect(screen.getByRole('button', { name: /clear filters/i })).toBeInTheDocument();
  });
});

// ===========================================================================
// Блок 2: OA checkbox — catalog режим (B1, B10 fix)
// ===========================================================================

describe('OA checkbox — catalog режим', () => {
  it('click: вызывает setHistoryFilters + setPage(1) + fetchArticles', () => {
    renderFilters();
    fireEvent.click(screen.getByTestId('oa-checkbox'));
    // checked=false → onClick вызывает onCheckedChange(!false) = onCheckedChange(true)
    expect(historyState.setHistoryFilters).toHaveBeenCalledWith({ openAccessOnly: true });
    expect(articleState.setPage).toHaveBeenCalledWith(1);
    expect(articleState.fetchArticles).toHaveBeenCalledTimes(1);
  });

  it('click при checked=true: вызывает setHistoryFilters с openAccessOnly: undefined', () => {
    // checked=true → onClick вызывает onCheckedChange(!true) = onCheckedChange(false)
    historyState.historyFilters = { openAccessOnly: true };
    renderFilters();
    fireEvent.click(screen.getByTestId('oa-checkbox'));
    expect(historyState.setHistoryFilters).toHaveBeenCalledWith({ openAccessOnly: undefined });
  });
});

// ===========================================================================
// Блок 3: OA checkbox — scopus режим (B8, B9 fix)
// ===========================================================================

describe('OA checkbox — scopus режим', () => {
  beforeEach(() => {
    articleState.searchMode = 'scopus';
  });

  it('click: вызывает setHistoryFilters, fetchArticles НЕ вызывается', () => {
    renderFilters();
    fireEvent.click(screen.getByTestId('oa-checkbox'));
    expect(historyState.setHistoryFilters).toHaveBeenCalledWith({ openAccessOnly: true });
    expect(articleState.fetchArticles).not.toHaveBeenCalled();
    expect(articleState.setPage).not.toHaveBeenCalled();
  });

  it('click: появляется badge «Filters changed — search again to apply»', () => {
    renderFilters();
    fireEvent.click(screen.getByTestId('oa-checkbox'));
    expect(screen.getByText(/filters changed/i)).toBeInTheDocument();
  });
});

// ===========================================================================
// Блок 4: year inputs — debounce-механизм (без fake timers)
//
// Debounce тестируется через spy на setTimeout/clearTimeout:
//   — setHistoryFilters вызывается НЕМЕДЛЕННО (не дебаунсится)
//   — fetchArticles вызывается через setTimeout(fn, 400) (дебаунс)
//   — повторный ввод отменяет предыдущий таймаут через clearTimeout
// ===========================================================================

describe('year inputs — catalog режим (debounce)', () => {
  it('year_from: вызывает setHistoryFilters немедленно', () => {
    renderFilters();
    fireEvent.change(screen.getByLabelText('Year from'), { target: { value: '2020' } });
    expect(historyState.setHistoryFilters).toHaveBeenCalledWith({ yearFrom: 2020 });
  });

  it('year_from: fetchArticles откладывается через setTimeout(fn, 400)', () => {
    const timeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    renderFilters();
    fireEvent.change(screen.getByLabelText('Year from'), { target: { value: '2020' } });
    // fetchArticles не вызван немедленно
    expect(articleState.fetchArticles).not.toHaveBeenCalled();
    // setTimeout зарегистрирован с delay=400
    expect(timeoutSpy).toHaveBeenCalledWith(expect.any(Function), 400);
    timeoutSpy.mockRestore();
  });

  it('повторный ввод: clearTimeout вызывается для отмены предыдущего debounce', () => {
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout');
    renderFilters();
    const input = screen.getByLabelText('Year from');
    fireEvent.change(input, { target: { value: '2019' } });
    fireEvent.change(input, { target: { value: '2020' } }); // второй ввод должен отменить первый таймаут
    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });

  it('год очищается: setHistoryFilters получает yearFrom: undefined', () => {
    historyState.historyFilters = { yearFrom: 2020 };
    renderFilters();
    fireEvent.change(screen.getByLabelText('Year from'), { target: { value: '' } });
    expect(historyState.setHistoryFilters).toHaveBeenCalledWith({ yearFrom: undefined });
  });

  it('year_to: вызывает setHistoryFilters немедленно', () => {
    renderFilters();
    fireEvent.change(screen.getByLabelText('Year to'), { target: { value: '2024' } });
    expect(historyState.setHistoryFilters).toHaveBeenCalledWith({ yearTo: 2024 });
  });
});

// ===========================================================================
// Блок 5: year inputs — scopus режим
// ===========================================================================

describe('year inputs — scopus режим', () => {
  it('year_from: вызывает setHistoryFilters, fetchArticles НЕ вызывается', () => {
    articleState.searchMode = 'scopus';
    renderFilters();
    fireEvent.change(screen.getByLabelText('Year from'), { target: { value: '2020' } });
    expect(historyState.setHistoryFilters).toHaveBeenCalledWith({ yearFrom: 2020 });
    expect(articleState.fetchArticles).not.toHaveBeenCalled();
  });

  it('year_from: setTimeout использует filtersChanged, не fetchArticles', () => {
    articleState.searchMode = 'scopus';
    const timeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    renderFilters();
    fireEvent.change(screen.getByLabelText('Year from'), { target: { value: '2020' } });
    // debounce зарегистрирован (для badge, а не для fetchArticles)
    expect(timeoutSpy).toHaveBeenCalledWith(expect.any(Function), 400);
    expect(articleState.fetchArticles).not.toHaveBeenCalled();
    timeoutSpy.mockRestore();
  });
});

// ===========================================================================
// Блок 6: clearFilters (B11 fix)
// ===========================================================================

describe('clearFilters', () => {
  it('catalog: вызывает resetFilters + setPage(1) + fetchArticles', () => {
    historyState.historyFilters = { openAccessOnly: true };
    renderFilters();
    fireEvent.click(screen.getByRole('button', { name: /clear filters/i }));
    expect(historyState.resetFilters).toHaveBeenCalledTimes(1);
    expect(articleState.setPage).toHaveBeenCalledWith(1);
    expect(articleState.fetchArticles).toHaveBeenCalledTimes(1);
  });

  it('scopus: вызывает resetFilters, fetchArticles НЕ вызывается', () => {
    articleState.searchMode = 'scopus';
    historyState.historyFilters = { openAccessOnly: true };
    renderFilters();
    fireEvent.click(screen.getByRole('button', { name: /clear filters/i }));
    expect(historyState.resetFilters).toHaveBeenCalledTimes(1);
    expect(articleState.fetchArticles).not.toHaveBeenCalled();
  });

  it('scopus: badge «Filters changed» исчезает после clearFilters', () => {
    articleState.searchMode = 'scopus';
    historyState.historyFilters = { openAccessOnly: true };
    renderFilters();
    // Показываем badge через изменение фильтра
    fireEvent.click(screen.getByTestId('oa-checkbox'));
    expect(screen.getByText(/filters changed/i)).toBeInTheDocument();
    // clearFilters сбрасывает badge
    fireEvent.click(screen.getByRole('button', { name: /clear filters/i }));
    expect(screen.queryByText(/filters changed/i)).not.toBeInTheDocument();
  });
});

// ===========================================================================
// Блок 7: toggleDocType через MultiSelectCombobox (B1 fix)
// ===========================================================================

describe('toggleDocType', () => {
  it('catalog: добавляет тип в docTypes + вызывает fetchArticles', () => {
    statsState.stats = MOCK_STATS;
    renderFilters();
    fireEvent.click(screen.getByTestId('item-Article'));
    expect(historyState.setHistoryFilters).toHaveBeenCalledWith({ docTypes: ['Article'] });
    expect(articleState.fetchArticles).toHaveBeenCalledTimes(1);
    expect(articleState.setPage).toHaveBeenCalledWith(1);
  });

  it('catalog: убирает тип при повторном клике (docTypes: undefined когда список пуст)', () => {
    statsState.stats = MOCK_STATS;
    historyState.historyFilters = { docTypes: ['Article'] };
    renderFilters();
    fireEvent.click(screen.getByTestId('item-Article'));
    expect(historyState.setHistoryFilters).toHaveBeenCalledWith({ docTypes: undefined });
  });

  it('scopus: добавляет тип + показывает badge, fetchArticles НЕ вызывается', () => {
    articleState.searchMode = 'scopus';
    renderFilters();
    fireEvent.click(screen.getByTestId('item-Article'));
    expect(historyState.setHistoryFilters).toHaveBeenCalledWith({ docTypes: ['Article'] });
    expect(screen.getByText(/filters changed/i)).toBeInTheDocument();
    expect(articleState.fetchArticles).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// Блок 8: toggleCountry через MultiSelectCombobox (B1 fix)
// ===========================================================================

describe('toggleCountry', () => {
  it('catalog: добавляет страну в countries + fetchArticles', () => {
    statsState.stats = MOCK_STATS;
    renderFilters();
    fireEvent.click(screen.getByTestId('item-Russia'));
    expect(historyState.setHistoryFilters).toHaveBeenCalledWith({ countries: ['Russia'] });
    expect(articleState.fetchArticles).toHaveBeenCalledTimes(1);
  });

  it('catalog: убирает страну при повторном клике', () => {
    statsState.stats = MOCK_STATS;
    historyState.historyFilters = { countries: ['Russia'] };
    renderFilters();
    fireEvent.click(screen.getByTestId('item-Russia'));
    expect(historyState.setHistoryFilters).toHaveBeenCalledWith({ countries: undefined });
  });
});

// ===========================================================================
// Блок 9: режимно-зависимые источники опций (B2 fix)
// ===========================================================================

describe('режимно-зависимые опции', () => {
  it('catalog: doc_types берутся из statsStore, не из SCOPUS_DOC_TYPES', () => {
    statsState.stats = MOCK_STATS; // только Article и Review
    renderFilters();
    expect(screen.getByTestId('item-Article')).toBeInTheDocument();
    expect(screen.getByTestId('item-Review')).toBeInTheDocument();
    // 'Conference Paper' только в SCOPUS_DOC_TYPES, не в MOCK_STATS → не рендерится
    expect(screen.queryByTestId('item-Conference Paper')).not.toBeInTheDocument();
  });

  it('scopus: doc_types берутся из SCOPUS_DOC_TYPES, stats игнорируется', () => {
    articleState.searchMode = 'scopus';
    statsState.stats = MOCK_STATS; // stats есть, но режим scopus → игнорируется
    renderFilters();
    // 'Conference Paper' и 'Short Survey' только в SCOPUS_DOC_TYPES
    expect(screen.getByTestId('item-Conference Paper')).toBeInTheDocument();
    expect(screen.getByTestId('item-Short Survey')).toBeInTheDocument();
  });

  it('catalog: countries берутся из statsStore (только Russia, USA)', () => {
    statsState.stats = MOCK_STATS;
    renderFilters();
    expect(screen.getByTestId('item-Russia')).toBeInTheDocument();
    expect(screen.getByTestId('item-USA')).toBeInTheDocument();
    // 'China' есть в SCOPUS_COUNTRIES, но не в MOCK_STATS → не рендерится в catalog
    expect(screen.queryByTestId('item-China')).not.toBeInTheDocument();
  });
});

// ===========================================================================
// Блок 10: lifecycle badge «Filters changed» (B8 fix)
// ===========================================================================

describe('badge «Filters changed» — lifecycle', () => {
  it('badge исчезает когда liveResults обновляются после Scopus-поиска', () => {
    articleState.searchMode = 'scopus';
    const { rerender } = renderFilters();

    // Вызываем изменение фильтра → badge появляется
    fireEvent.click(screen.getByTestId('oa-checkbox'));
    expect(screen.getByText(/filters changed/i)).toBeInTheDocument();

    // Scopus-поиск завершён: liveResults обновились → useEffect сбрасывает badge
    articleState.liveResults = [makeArticle(1)];
    act(() => { rerender(<ArticleFiltersSidebar />); });
    expect(screen.queryByText(/filters changed/i)).not.toBeInTheDocument();
  });

  it('badge НЕ появляется в catalog-режиме (авто-фетч вместо badge)', () => {
    renderFilters();
    fireEvent.click(screen.getByTestId('oa-checkbox'));
    expect(screen.queryByText(/filters changed/i)).not.toBeInTheDocument();
    expect(articleState.fetchArticles).toHaveBeenCalledTimes(1);
  });
});
