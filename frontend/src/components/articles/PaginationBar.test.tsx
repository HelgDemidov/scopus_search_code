import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PaginationBar, SIZE_OPTIONS, type PageSize } from './PaginationBar';

// Базовые props для состояния с 3 страницами (25 записей, size=10)
const defaults = {
  page: 1,
  size: 10 as PageSize,
  total: 25,
  totalPages: 3,          // Math.ceil(25/10)
  appendMode: false,
  onPageChange: vi.fn(),
  onSizeChange: vi.fn(),
  onToggleMode: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PaginationBar — null cases', () => {

  it('возвращает null при total=0 (totalPages=1)', () => {
    const { container } = render(
      <PaginationBar {...defaults} total={0} totalPages={0} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('возвращает null при ровно 1 странице (total=10, size=10)', () => {
    const { container } = render(
      <PaginationBar {...defaults} total={10} size={10} totalPages={1} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('рендерится при total=11, size=10 (2 страницы)', () => {
    render(<PaginationBar {...defaults} total={11} totalPages={2} />);
    expect(screen.getByRole('navigation')).toBeInTheDocument();
  });
});

describe('PaginationBar — Prev/Next disabled', () => {

  it('Prev disabled на первой странице', () => {
    render(<PaginationBar {...defaults} page={1} />);
    expect(screen.getByRole('button', { name: /previous page/i })).toBeDisabled();
  });

  it('Next disabled на последней странице (page=3, total=25, size=10)', () => {
    render(<PaginationBar {...defaults} page={3} total={25} size={10} totalPages={3} />);
    expect(screen.getByRole('button', { name: /next page/i })).toBeDisabled();
  });

  it('Prev и Next активны на средней странице', () => {
    render(<PaginationBar {...defaults} page={2} />);
    expect(screen.getByRole('button', { name: /previous page/i })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: /next page/i })).not.toBeDisabled();
  });
});

describe('PaginationBar — навигация', () => {

  it('клик Prev вызывает onPageChange(page - 1)', async () => {
    const onPageChange = vi.fn();
    render(
      <PaginationBar {...defaults} page={2} onPageChange={onPageChange} />
    );
    await userEvent.click(screen.getByRole('button', { name: /previous page/i }));
    expect(onPageChange).toHaveBeenCalledWith(1);
  });

  it('клик Next вызывает onPageChange(page + 1)', async () => {
    const onPageChange = vi.fn();
    render(
      <PaginationBar {...defaults} page={1} onPageChange={onPageChange} />
    );
    await userEvent.click(screen.getByRole('button', { name: /next page/i }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it('клик по номеру страницы вызывает onPageChange(n)', async () => {
    const onPageChange = vi.fn();
    render(
      <PaginationBar {...defaults} page={1} onPageChange={onPageChange} />
    );
    await userEvent.click(screen.getByRole('button', { name: '2' }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });
});

describe('PaginationBar — size selector', () => {

  it('клик по size=25 вызывает onSizeChange(25)', async () => {
    const onSizeChange = vi.fn();
    render(<PaginationBar {...defaults} onSizeChange={onSizeChange} />);
    await userEvent.click(screen.getByRole('button', { name: '25' }));
    expect(onSizeChange).toHaveBeenCalledWith(25);
  });

  it('все три варианта SIZE_OPTIONS рендерятся как кнопки', () => {
    render(<PaginationBar {...defaults} />);
    SIZE_OPTIONS.forEach(s => {
      expect(
        screen.getByRole('button', { name: String(s) })
      ).toBeInTheDocument();
    });
  });
});

describe('PaginationBar — accessibility', () => {

  it('активная страница имеет aria-current="page"', () => {
    render(<PaginationBar {...defaults} page={2} />);
    expect(
      screen.getByRole('button', { current: 'page' })
    ).toHaveTextContent('2');
  });

  it('ellipsis — span с aria-hidden, а не button', () => {
    // 10 страниц при size=10 → ellipsis появляется когда page=1
    render(
      <PaginationBar {...defaults} page={1} total={100} size={10} totalPages={10} />
    );
    // Кнопки с текстом «…» быть не должно
    expect(screen.queryByRole('button', { name: '…' })).toBeNull();
    // span[aria-hidden] с ellipsis должен быть в DOM
    const ellipsis = document.querySelector('span[aria-hidden="true"]');
    expect(ellipsis).toBeInTheDocument();
  });

  it('safePage: page=0 не вызывает ошибок (Math.max защита)', () => {
    // page=0 → safePage=1 → компонент ведёт себя как page=1
    expect(() =>
      render(<PaginationBar {...defaults} page={0} total={25} totalPages={3} />)
    ).not.toThrow();
    expect(screen.getByRole('button', { name: /previous page/i })).toBeDisabled();
  });
});
