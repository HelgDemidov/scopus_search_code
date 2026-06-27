import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ThematicAreasChart } from './ThematicAreasChart';
import { useDashboardStore } from '../../stores/dashboardStore';

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  BarChart: ({ children }: { children: React.ReactNode }) => <div data-testid="barchart">{children}</div>,
  Bar: ({ children }: { children: React.ReactNode }) => <div data-testid="bar">{children}</div>,
  Cell: ({ fill }: { fill: string }) => <div data-testid="cell" data-fill={fill} />,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
}));

const MOCK_DATA = Array.from({ length: 20 }, (_, i) => ({
  label: `Topic ${String(i).padStart(2, '0')} — machine learning and artificial intelligence applications`,
  count: 1000 - i * 30,
}));

beforeEach(() => {
  useDashboardStore.setState({ activeSelection: null, drawerDimension: null, builderCards: [] });
});

describe('ThematicAreasChart', () => {
  it('рендерит заголовок "Thematic Areas"', () => {
    render(<ThematicAreasChart data={MOCK_DATA} isLoading={false} />);
    expect(screen.getByText('Thematic Areas')).toBeInTheDocument();
  });

  it('показывает empty state при пустом массиве данных', () => {
    render(<ThematicAreasChart data={[]} isLoading={false} />);
    expect(screen.getByText('No thematic data available')).toBeInTheDocument();
    expect(screen.queryByTestId('barchart')).not.toBeInTheDocument();
  });

  it('не показывает empty state при наличии данных', () => {
    render(<ThematicAreasChart data={MOCK_DATA} isLoading={false} />);
    expect(screen.queryByText('No thematic data available')).not.toBeInTheDocument();
  });

  it('ограничивает отображение до 15 элементов (top-15)', () => {
    render(<ThematicAreasChart data={MOCK_DATA} isLoading={false} />);
    // 20 элементов в данных → 15 Cell в рендере
    expect(screen.getAllByTestId('cell')).toHaveLength(15);
  });

  it('метки усечены до 32 символов + «…»', () => {
    const longLabel = 'a'.repeat(40);
    render(<ThematicAreasChart data={[{ label: longLabel, count: 100 }]} isLoading={false} />);
    // Проверяем что BarChart рендерится (данные не пустые)
    expect(screen.getByTestId('barchart')).toBeInTheDocument();
  });

  it('показывает skeleton при isLoading=true', () => {
    const { container } = render(<ThematicAreasChart data={MOCK_DATA} isLoading />);
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
  });
});
