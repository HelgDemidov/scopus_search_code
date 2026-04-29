import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ScopusPaginationBar, type LiveSize } from './ScopusPaginationBar';

// Базовые props: 15 результатов, режим по 10, страница 1
const defaults = {
  livePage: 1,
  liveSize: 10 as LiveSize,
  total: 15,
  onPageChange: vi.fn(),
  onSizeChange: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Блок 1: null cases
// ---------------------------------------------------------------------------

describe('ScopusPaginationBar — null cases', () => {
  it('возвращает null при total=0', () => {
    const { container } = render(<ScopusPaginationBar {...defaults} total={0} />);
    expect(container.firstChild).toBeNull();
  });

  it('возвращает null при total=10 (граница включительно)', () => {
    const { container } = render(<ScopusPaginationBar {...defaults} total={10} />);
    expect(container.firstChild).toBeNull();
  });

  it('рендерится при total=11', () => {
    render(<ScopusPaginationBar {...defaults} total={11} />);
    expect(screen.getByRole('navigation')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Блок 2: навигация в режиме liveSize=10
// ---------------------------------------------------------------------------

describe('ScopusPaginationBar — страничная навигация (liveSize=10)', () => {
  it('Prev disabled на первой странице', () => {
    render(<ScopusPaginationBar {...defaults} livePage={1} />);
    expect(
      screen.getByRole('button', { name: /previous page/i }),
    ).toBeDisabled();
  });

  it('Next disabled на последней странице (total=15, livePage=2)', () => {
    render(<ScopusPaginationBar {...defaults} livePage={2} total={15} />);
    expect(
      screen.getByRole('button', { name: /next page/i }),
    ).toBeDisabled();
  });

  it('клик Prev вызывает onPageChange(livePage - 1)', async () => {
    const onPageChange = vi.fn();
    render(
      <ScopusPaginationBar {...defaults} livePage={2} onPageChange={onPageChange} />,
    );
    await userEvent.click(
      screen.getByRole('button', { name: /previous page/i }),
    );
    expect(onPageChange).toHaveBeenCalledWith(1);
  });

  it('клик Next вызывает onPageChange(livePage + 1)', async () => {
    const onPageChange = vi.fn();
    render(
      <ScopusPaginationBar {...defaults} livePage={1} onPageChange={onPageChange} />,
    );
    await userEvent.click(
      screen.getByRole('button', { name: /next page/i }),
    );
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  // -- Граничные случаи --

  // Regression guard: safePage = Math.max(1, livePage).
  // livePage=0 невозможен в нормальном флоу (handleSearch сбрасывает в 1
  // до ре-рендера), но контракт должен быть явно задокументирован тестом —
  // защита от будущих рефакторингов (URL-параметры, SSR-гидратация и т.д.)
  it('при livePage=0 safePage=1: Prev disabled, строка «Showing 1–10 of 25»', () => {
    render(
      <ScopusPaginationBar {...defaults} livePage={0} total={25} />,
    );
    // safePage = Math.max(1, 0) = 1 → Prev недоступен
    expect(
      screen.getByRole('button', { name: /previous page/i }),
    ).toBeDisabled();
    // from=(1-1)*10+1=1, to=min(1*10,25)=10
    expect(screen.getByText(/Showing 1–10 of 25/)).toBeInTheDocument();
  });

  // Граничный максимум Scopus API: 25 записей → ceil(25/10) = 3 страницы
  it('при total=25 рендерятся кнопки страниц [1][2][3]', () => {
    render(
      <ScopusPaginationBar {...defaults} livePage={1} total={25} />,
    );
    expect(screen.getByRole('button', { name: '1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '2' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '3' })).toBeInTheDocument();
  });

  // Прямой клик по номеру страницы — отдельный code path от Prev/Next
  it('клик на кнопку страницы [2] вызывает onPageChange(2)', async () => {
    const onPageChange = vi.fn();
    render(
      <ScopusPaginationBar
        {...defaults}
        livePage={1}
        total={25}
        onPageChange={onPageChange}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: '2' }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });
});

// ---------------------------------------------------------------------------
// Блок 3: тоггл «10 per page / All»
// ---------------------------------------------------------------------------

describe('ScopusPaginationBar — тоггл режима', () => {
  it('клик «All» вызывает onSizeChange("all")', async () => {
    const onSizeChange = vi.fn();
    render(<ScopusPaginationBar {...defaults} onSizeChange={onSizeChange} />);
    // Кнопка рендерится как «All (15)» — матч по началу строки
    await userEvent.click(screen.getByRole('button', { name: /^All/i }));
    expect(onSizeChange).toHaveBeenCalledWith('all');
  });

  it('клик «10 per page» вызывает onSizeChange(10)', async () => {
    const onSizeChange = vi.fn();
    render(
      <ScopusPaginationBar
        {...defaults}
        liveSize="all"
        onSizeChange={onSizeChange}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /10 per page/i }));
    expect(onSizeChange).toHaveBeenCalledWith(10);
  });

  it('при liveSize="all" кнопки страниц не рендерятся', () => {
    render(<ScopusPaginationBar {...defaults} liveSize="all" />);
    // Группа кнопок страниц отсутствует
    expect(
      screen.queryByRole('group', { name: /^Pages$/i }),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Блок 4: строка состояния
// ---------------------------------------------------------------------------

describe('ScopusPaginationBar — строка состояния', () => {
  it('liveSize=10, livePage=1, total=15 → «Showing 1–10 of 15»', () => {
    render(
      <ScopusPaginationBar {...defaults} livePage={1} liveSize={10} total={15} />,
    );
    expect(screen.getByText(/Showing 1–10 of 15/)).toBeInTheDocument();
  });

  it('liveSize="all", total=15 → «Showing 1–15 of 15»', () => {
    render(
      <ScopusPaginationBar {...defaults} liveSize="all" total={15} />,
    );
    expect(screen.getByText(/Showing 1–15 of 15/)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Блок 5: accessibility
// ---------------------------------------------------------------------------

describe('ScopusPaginationBar — accessibility', () => {
  it('активная страница имеет aria-current="page"', () => {
    render(<ScopusPaginationBar {...defaults} livePage={1} />);
    expect(
      screen.getByRole('button', { current: 'page' }),
    ).toHaveTextContent('1');
  });

  it('<nav> имеет aria-label="Scopus results navigation"', () => {
    render(<ScopusPaginationBar {...defaults} />);
    expect(
      screen.getByRole('navigation', { name: /scopus results navigation/i }),
    ).toBeInTheDocument();
  });
});
