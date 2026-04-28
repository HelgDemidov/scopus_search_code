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
      screen.getByRole('button', { name: /предыдущая страница/i }),
    ).toBeDisabled();
  });

  it('Next disabled на последней странице (total=15, livePage=2)', () => {
    render(<ScopusPaginationBar {...defaults} livePage={2} total={15} />);
    expect(
      screen.getByRole('button', { name: /следующая страница/i }),
    ).toBeDisabled();
  });

  it('клик Prev вызывает onPageChange(livePage - 1)', async () => {
    const onPageChange = vi.fn();
    render(
      <ScopusPaginationBar {...defaults} livePage={2} onPageChange={onPageChange} />,
    );
    await userEvent.click(
      screen.getByRole('button', { name: /предыдущая страница/i }),
    );
    expect(onPageChange).toHaveBeenCalledWith(1);
  });

  it('клик Next вызывает onPageChange(livePage + 1)', async () => {
    const onPageChange = vi.fn();
    render(
      <ScopusPaginationBar {...defaults} livePage={1} onPageChange={onPageChange} />,
    );
    await userEvent.click(
      screen.getByRole('button', { name: /следующая страница/i }),
    );
    expect(onPageChange).toHaveBeenCalledWith(2);
  });
});

// ---------------------------------------------------------------------------
// Блок 3: тоггл «По 10 / Все»
// ---------------------------------------------------------------------------

describe('ScopusPaginationBar — тоггл режима', () => {
  it('клик «Все» вызывает onSizeChange("all")', async () => {
    const onSizeChange = vi.fn();
    render(<ScopusPaginationBar {...defaults} onSizeChange={onSizeChange} />);
    await userEvent.click(screen.getByRole('button', { name: /все/i }));
    expect(onSizeChange).toHaveBeenCalledWith('all');
  });

  it('клик «По 10» вызывает onSizeChange(10)', async () => {
    const onSizeChange = vi.fn();
    render(
      <ScopusPaginationBar
        {...defaults}
        liveSize="all"
        onSizeChange={onSizeChange}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /по 10/i }));
    expect(onSizeChange).toHaveBeenCalledWith(10);
  });

  it('при liveSize="all" кнопки страниц не рендерятся', () => {
    render(<ScopusPaginationBar {...defaults} liveSize="all" />);
    // Группа кнопок страниц отсутствует
    expect(
      screen.queryByRole('group', { name: /страницы/i }),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Блок 4: строка состояния
// ---------------------------------------------------------------------------

describe('ScopusPaginationBar — строка состояния', () => {
  it('liveSize=10, livePage=1, total=15 → «Показано 1–10 из 15»', () => {
    render(
      <ScopusPaginationBar {...defaults} livePage={1} liveSize={10} total={15} />,
    );
    expect(screen.getByText(/1–10 из 15/)).toBeInTheDocument();
  });

  it('liveSize="all", total=15 → «Показано 1–15 из 15»', () => {
    render(
      <ScopusPaginationBar {...defaults} liveSize="all" total={15} />,
    );
    expect(screen.getByText(/1–15 из 15/)).toBeInTheDocument();
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

  it('<nav> имеет aria-label="Навигация по результатам Scopus"', () => {
    render(<ScopusPaginationBar {...defaults} />);
    expect(
      screen.getByRole('navigation', { name: /навигация по результатам scopus/i }),
    ).toBeInTheDocument();
  });
});
