import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TopCountriesChart } from './TopCountriesChart';
import { useDashboardStore } from '../../stores/dashboardStore';
import { DIMENSION_COLORS } from './chartColors';

// ---------------------------------------------------------------------------
// Mock recharts: тестируем поведение компонента, а не SVG-рендеринг
// ---------------------------------------------------------------------------
vi.mock('recharts', () => {
  const BarEntry = ({ onClick, children }: {
    onClick?: (entry: { label: string; count: number }) => void;
    children?: React.ReactNode;
  }) => (
    <div
      data-testid="bar"
      onClick={() => onClick?.({ label: 'China', count: 34000 })}
    >
      {children}
    </div>
  );

  return {
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    BarChart: ({ children }: { children: React.ReactNode }) => <div data-testid="barchart">{children}</div>,
    Bar: BarEntry,
    Cell: ({ fill, 'data-label': label }: { fill: string; 'data-label'?: string }) => (
      <div data-testid="cell" data-fill={fill} data-label={label} />
    ),
    XAxis: () => null,
    YAxis: () => null,
    CartesianGrid: () => null,
    Tooltip: () => null,
  };
});

const MOCK_DATA = [
  { label: 'China', count: 34000 },
  { label: 'India', count: 15000 },
  { label: 'United States', count: 12000 },
  { label: 'United Kingdom', count: 8000 },
  { label: 'Germany', count: 6000 },
];

beforeEach(() => {
  useDashboardStore.setState({ activeSelection: null, drawerDimension: null, builderCards: [] });
});

describe('TopCountriesChart', () => {
  it('рендерит заголовок через ChartCard', () => {
    render(<TopCountriesChart data={MOCK_DATA} isLoading={false} />);
    expect(screen.getByText('Countries')).toBeInTheDocument();
  });

  it('показывает skeleton при isLoading=true', () => {
    const { container } = render(<TopCountriesChart data={[]} isLoading />);
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
    expect(screen.queryByTestId('barchart')).not.toBeInTheDocument();
  });

  it('рендерит BarChart при isLoading=false', () => {
    render(<TopCountriesChart data={MOCK_DATA} isLoading={false} />);
    expect(screen.getByTestId('barchart')).toBeInTheDocument();
  });

  it('клик по бару вызывает setSelection с dimension=country', async () => {
    render(<TopCountriesChart data={MOCK_DATA} isLoading={false} />);
    await userEvent.click(screen.getByTestId('bar'));
    const sel = useDashboardStore.getState().activeSelection;
    expect(sel).toEqual({ dimension: 'country', value: 'China' });
  });

  it('повторный клик по тому же бару сбрасывает selection', async () => {
    render(<TopCountriesChart data={MOCK_DATA} isLoading={false} />);
    const bar = screen.getByTestId('bar');
    await userEvent.click(bar);
    await userEvent.click(bar);
    expect(useDashboardStore.getState().activeSelection).toBeNull();
  });

  it('клик по заголовку открывает drawer', async () => {
    render(<TopCountriesChart data={MOCK_DATA} isLoading={false} />);
    await userEvent.click(screen.getByText('Countries'));
    expect(useDashboardStore.getState().drawerDimension).toBe('country');
  });
});

// ---------------------------------------------------------------------------
// Cross-filter: логика getCellFill
// Тестируем через Cell data-fill атрибут
// ---------------------------------------------------------------------------

describe('TopCountriesChart — cross-filter visual state', () => {
  const baseColor = DIMENSION_COLORS.country.base;
  const dimmedColor = DIMENSION_COLORS.country.dimmed;
  const selectedColor = DIMENSION_COLORS.country.selected;

  it('все ячейки имеют base-цвет при отсутствии selection', () => {
    render(<TopCountriesChart data={MOCK_DATA} isLoading={false} />);
    const cells = screen.getAllByTestId('cell');
    cells.forEach((cell) => {
      expect(cell).toHaveAttribute('data-fill', baseColor);
    });
  });

  it('при selection country=China: China=selected, остальные=dimmed', () => {
    useDashboardStore.setState({
      activeSelection: { dimension: 'country', value: 'China' },
    });
    render(<TopCountriesChart data={MOCK_DATA} isLoading={false} />);
    const cells = screen.getAllByTestId('cell');
    // Первая Cell (China) — selected
    expect(cells[0]).toHaveAttribute('data-fill', selectedColor);
    // Остальные — dimmed
    cells.slice(1).forEach((cell) => {
      expect(cell).toHaveAttribute('data-fill', dimmedColor);
    });
  });

  it('при selection другого измерения: все ячейки имеют base-цвет', () => {
    useDashboardStore.setState({
      activeSelection: { dimension: 'journal', value: 'Nature' },
    });
    render(<TopCountriesChart data={MOCK_DATA} isLoading={false} />);
    const cells = screen.getAllByTestId('cell');
    cells.forEach((cell) => {
      expect(cell).toHaveAttribute('data-fill', baseColor);
    });
  });
});
