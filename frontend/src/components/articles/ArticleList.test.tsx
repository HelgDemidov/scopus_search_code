import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, beforeEach, describe, it, expect } from 'vitest';
import { ArticleList } from './ArticleList';
import type { ArticleResponse } from '../../types/api';

// ---------------------------------------------------------------------------
// Моки модулей — объявляем ДО импорта тестируемого модуля
// ---------------------------------------------------------------------------

// Заменяем PaginationBar на stub с data-testid и захватом props
let capturedPaginationProps: Record<string, unknown> = {};
vi.mock('./PaginationBar', () => ({
  PaginationBar: (props: Record<string, unknown>) => {
    capturedPaginationProps = props;
    return <div data-testid="pagination-bar" />;
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

// Фабрика статьи с минимальными полями ArticleResponse
function makeArticle(id: number): ArticleResponse {
  return {
    id,
    title: `Article ${id}`,
    author: null,
    publication_date: '2024-01-01',
    cited_by_count: 0,
    scopus_id: null,
    doi: `doi-${id}`,
    abstract: null,
    journal: null,
    volume: null,
    issue: null,
    pages: null,
    document_type: null,
    open_access: false,
    affiliation_country: null,
    keyword: null,
    source_url: null,
  } as ArticleResponse;
}

// Фабрика полного набора props — все 10 обязательных props с разумными дефолтами
function makeProps(overrides: Record<string, unknown> = {}) {
  return {
    articles: [] as ArticleResponse[],
    isLoading: false,
    sortBy: 'date' as const,
    onSortChange: vi.fn(),
    page: 1,
    size: 10,
    total: 0,
    appendMode: false,
    onPageChange: vi.fn(),
    onSizeChange: vi.fn(),
    onToggleMode: vi.fn(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// IntersectionObserver мок — сохраняем каллбак для ручного trigger
// ---------------------------------------------------------------------------

let ioCallback: IntersectionObserverCallback | null = null;
const ioObserveMock = vi.fn();
const ioDisconnectMock = vi.fn();

beforeEach(() => {
  capturedPaginationProps = {};
  vi.clearAllMocks();
  ioCallback = null;

  // Глобальный stub IntersectionObserver — запоминаем каллбак для triggerа
  vi.stubGlobal(
    'IntersectionObserver',
    vi.fn((cb: IntersectionObserverCallback) => {
      ioCallback = cb;
      return { observe: ioObserveMock, disconnect: ioDisconnectMock };
    }),
  );
});

// Хелпер: имитируем попадание sentinel в viewport
function triggerIntersection(isIntersecting: boolean) {
  ioCallback?.(
    [{ isIntersecting } as IntersectionObserverEntry],
    {} as IntersectionObserver,
  );
}

// ---------------------------------------------------------------------------
// Блок 1: Счётчик и переключатель режима
// ---------------------------------------------------------------------------

describe('ArticleList — счётчик и переключатель режима', () => {

  it('total=0 — счётчик и кнопка-переключатель не рендерятся', () => {
    render(<ArticleList {...makeProps({ total: 0 })} />);
    expect(screen.queryByText(/articles/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /Scroll|Pages/i })).toBeNull();
  });

  it('total=150 — счётчик отображает количество статей', () => {
    render(<ArticleList {...makeProps({ total: 150 })} />);
    expect(screen.getByText(/150/)).toBeInTheDocument();
  });

  it('total>0, appendMode=false — кнопка показывает «Scroll»', () => {
    render(<ArticleList {...makeProps({ total: 50, appendMode: false })} />);
    expect(screen.getByRole('button', { name: 'Scroll' })).toBeInTheDocument();
  });

  it('total>0, appendMode=true — кнопка показывает «Pages»', () => {
    render(<ArticleList {...makeProps({ total: 50, appendMode: true })} />);
    expect(screen.getByRole('button', { name: 'Pages' })).toBeInTheDocument();
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
    expect(screen.queryByTestId('sentinel')).toBeNull();
  });

  it('appendMode=true, articles>0, !isLoading — рендерится sentinel, PaginationBar отсутствует', () => {
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
    expect(screen.queryByTestId('pagination-bar')).toBeNull();
  });

  it('isLoading=true — ни PaginationBar, ни sentinel не рендерятся', () => {
    render(
      <ArticleList
        {...makeProps({
          isLoading: true,
          articles: [makeArticle(1)],
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
        {...makeProps({ total: 50, appendMode: false, onToggleMode })}
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
    render(<ArticleList {...makeProps({ onSortChange })} />);
    await userEvent.click(screen.getByRole('button', { name: 'By citations' }));
    expect(onSortChange).toHaveBeenCalledWith('citations');
  });
});

// ---------------------------------------------------------------------------
// Блок 4: IntersectionObserver
// ---------------------------------------------------------------------------

describe('ArticleList — IntersectionObserver (append mode)', () => {

  it('sentinel в viewport, page < totalPages — вызывает onPageChange(page + 1)', () => {
    const onPageChange = vi.fn();
    render(
      <ArticleList
        {...makeProps({
          appendMode: true,
          articles: [makeArticle(1)],
          isLoading: false,
          page: 1,
          size: 10,
          total: 20, // 2 страницы → page 1 < totalPages 2
          onPageChange,
        })}
      />,
    );
    triggerIntersection(true);
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it('sentinel в viewport, page === totalPages — onPageChange не вызывается', () => {
    const onPageChange = vi.fn();
    render(
      <ArticleList
        {...makeProps({
          appendMode: true,
          articles: [makeArticle(1)],
          isLoading: false,
          page: 2,
          size: 10,
          total: 20, // 2 страницы → page 2 === totalPages 2 → запрос не отправляется
          onPageChange,
        })}
      />,
    );
    triggerIntersection(true);
    expect(onPageChange).not.toHaveBeenCalled();
  });
});
