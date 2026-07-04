import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { PersonalActivityChart } from './PersonalActivityChart';
import type { PersonalActivityResponse } from '../../types/api';

// Мок recharts — тот же паттерн, что TopCountriesByYearChart.test.tsx/DimensionDrawer.test.tsx:
// тестируем структуру/данные, а не реальный SVG-рендеринг.
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  ComposedChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="composedchart">{children}</div>
  ),
  Bar: ({ dataKey, fill }: { dataKey: string; fill: string }) => (
    <div data-testid="bar" data-key={dataKey} data-fill={fill} />
  ),
  Line: ({ dataKey }: { dataKey: string }) => <div data-testid="line" data-key={dataKey} />,
  Legend: () => <div data-testid="legend" />,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
}));

const MOCK_DATA: PersonalActivityResponse = {
  granularity: 'week',
  buckets: [
    {
      period_start: '2024-01-01',
      successful_searches: 3,
      zero_result_searches: 1,
      cumulative_unique_articles: 5,
    },
    {
      period_start: '2024-01-08',
      successful_searches: 2,
      zero_result_searches: 0,
      cumulative_unique_articles: 8,
    },
  ],
};

describe('PersonalActivityChart — загрузка', () => {
  it('показывает skeleton при isLoading=true', () => {
    const { container } = render(<PersonalActivityChart data={null} isLoading={true} />);
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
    expect(screen.queryByTestId('composedchart')).not.toBeInTheDocument();
  });
});

describe('PersonalActivityChart — пустое состояние', () => {
  it('data=null рендерит empty-сообщение вместо графика', () => {
    render(<PersonalActivityChart data={null} isLoading={false} />);
    expect(screen.getByText('Not enough data yet.')).toBeInTheDocument();
    expect(screen.queryByTestId('composedchart')).not.toBeInTheDocument();
  });

  it('buckets=[] рендерит empty-сообщение', () => {
    render(<PersonalActivityChart data={{ granularity: 'week', buckets: [] }} isLoading={false} />);
    expect(screen.getByText('Not enough data yet.')).toBeInTheDocument();
  });
});

describe('PersonalActivityChart — рендер данных', () => {
  it('рендерит ComposedChart с 2 stacked-барами (successful/zero-result) и 1 линией (cumulative)', () => {
    render(<PersonalActivityChart data={MOCK_DATA} isLoading={false} />);

    const bars = screen.getAllByTestId('bar');
    expect(bars).toHaveLength(2);
    expect(bars.map((b) => b.getAttribute('data-key'))).toEqual([
      'successful_searches',
      'zero_result_searches',
    ]);

    const line = screen.getByTestId('line');
    expect(line).toHaveAttribute('data-key', 'cumulative_unique_articles');
  });

  it('заголовок отражает грануляцию (week → "By week")', () => {
    render(<PersonalActivityChart data={MOCK_DATA} isLoading={false} />);
    expect(screen.getByText(/By week/)).toBeInTheDocument();
  });

  it('заголовок отражает грануляцию (month → "By month")', () => {
    render(
      <PersonalActivityChart
        data={{ ...MOCK_DATA, granularity: 'month' }}
        isLoading={false}
      />
    );
    expect(screen.getByText(/By month/)).toBeInTheDocument();
  });
});
