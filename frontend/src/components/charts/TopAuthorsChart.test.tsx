import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TopAuthorsChart } from './TopAuthorsChart';
import { useDashboardStore } from '../../stores/dashboardStore';
import { DIMENSION_COLORS } from './chartColors';

vi.mock('recharts', () => {
  const BarEntry = ({ onClick, children }: {
    onClick?: (entry: { label: string; count: number }) => void;
    children?: React.ReactNode;
  }) => (
    <div
      data-testid="bar"
      onClick={() => onClick?.({ label: 'J. Smith', count: 42 })}
    >
      {children}
    </div>
  );

  return {
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    BarChart: ({ children }: { children: React.ReactNode }) => <div data-testid="barchart">{children}</div>,
    Bar: BarEntry,
    Cell: ({ fill }: { fill: string }) => <div data-testid="cell" data-fill={fill} />,
    XAxis: () => null,
    YAxis: () => null,
    CartesianGrid: () => null,
    Tooltip: () => null,
  };
});

const MOCK_DATA = Array.from({ length: 20 }, (_, i) => ({
  label: `Author ${String(i).padStart(2, '0')}`,
  count: 100 - i * 3,
}));

beforeEach(() => {
  useDashboardStore.setState({ activeSelection: null, drawerDimension: null, builderCards: [] });
});

describe('TopAuthorsChart', () => {
  it('рендерит заголовок "Top Authors"', () => {
    render(<TopAuthorsChart data={MOCK_DATA} isLoading={false} />);
    expect(screen.getByText('Top Authors')).toBeInTheDocument();
  });

  it('показывает skeleton при isLoading=true', () => {
    const { container } = render(<TopAuthorsChart data={MOCK_DATA} isLoading />);
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
    expect(screen.queryByTestId('barchart')).not.toBeInTheDocument();
  });

  it('показывает empty state при пустом массиве', () => {
    render(<TopAuthorsChart data={[]} isLoading={false} />);
    expect(screen.getByText('No author data available')).toBeInTheDocument();
    expect(screen.queryByTestId('barchart')).not.toBeInTheDocument();
  });

  it('ограничивает отображение до 15 элементов (top-15)', () => {
    render(<TopAuthorsChart data={MOCK_DATA} isLoading={false} />);
    expect(screen.getAllByTestId('cell')).toHaveLength(15);
  });

  it('клик по бару вызывает setSelection с dimension=author', async () => {
    render(<TopAuthorsChart data={MOCK_DATA} isLoading={false} />);
    await userEvent.click(screen.getByTestId('bar'));
    expect(useDashboardStore.getState().activeSelection).toEqual({
      dimension: 'author',
      value: 'J. Smith',
    });
  });

  it('клик по заголовку открывает drawer для author', async () => {
    render(<TopAuthorsChart data={MOCK_DATA} isLoading={false} />);
    await userEvent.click(screen.getByText('Top Authors'));
    expect(useDashboardStore.getState().drawerDimension).toBe('author');
  });
});

describe('TopAuthorsChart — cross-filter visual state', () => {
  const baseColor = DIMENSION_COLORS.author.base;
  const dimmedColor = DIMENSION_COLORS.author.dimmed;
  const selectedColor = DIMENSION_COLORS.author.selected;

  it('все ячейки имеют base-цвет при отсутствии selection', () => {
    render(<TopAuthorsChart data={MOCK_DATA.slice(0, 3)} isLoading={false} />);
    screen.getAllByTestId('cell').forEach((cell) => {
      expect(cell).toHaveAttribute('data-fill', baseColor);
    });
  });

  it('при selection author: выбранный=selected, остальные=dimmed', () => {
    useDashboardStore.setState({
      activeSelection: { dimension: 'author', value: 'Author 00' },
    });
    render(<TopAuthorsChart data={MOCK_DATA.slice(0, 3)} isLoading={false} />);
    const cells = screen.getAllByTestId('cell');
    expect(cells[0]).toHaveAttribute('data-fill', selectedColor);
    cells.slice(1).forEach((cell) => {
      expect(cell).toHaveAttribute('data-fill', dimmedColor);
    });
  });

  it('при selection другого измерения: все ячейки имеют base-цвет', () => {
    useDashboardStore.setState({
      activeSelection: { dimension: 'country', value: 'China' },
    });
    render(<TopAuthorsChart data={MOCK_DATA.slice(0, 3)} isLoading={false} />);
    screen.getAllByTestId('cell').forEach((cell) => {
      expect(cell).toHaveAttribute('data-fill', baseColor);
    });
  });
});
