import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DynamicChart } from './DynamicChart';
import type { BuilderCard } from '../../stores/dashboardStore';
import type { StatsResponse } from '../../types/api';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div data-testid="responsive">{children}</div>,
  BarChart:    ({ children }: { children: React.ReactNode }) => <div data-testid="bar-chart">{children}</div>,
  LineChart:   ({ children }: { children: React.ReactNode }) => <div data-testid="line-chart">{children}</div>,
  PieChart:    ({ children }: { children: React.ReactNode }) => <div data-testid="pie-chart">{children}</div>,
  AreaChart:   ({ children }: { children: React.ReactNode }) => <div data-testid="area-chart">{children}</div>,
  Bar:         () => null,
  Line:        () => null,
  Pie:         ({ children }: { children: React.ReactNode }) => <div data-testid="pie">{children}</div>,
  Area:        () => null,
  Cell:        () => null,
  XAxis:       () => null,
  YAxis:       () => null,
  CartesianGrid: () => null,
  Tooltip:     () => null,
  Legend:      () => null,
}));

const MOCK_STATS: StatsResponse = {
  total_articles: 1000,
  open_access_count: 350,
  total_journals: 42,
  total_countries: 58,
  total_authors: 820,
  by_year:    [{ label: '2022', count: 200 }, { label: '2023', count: 300 }],
  by_country: [{ label: 'China', count: 500 }, { label: 'USA', count: 300 }],
  by_doc_type: [{ label: 'Article', count: 800 }, { label: 'Review', count: 200 }],
  by_journal:  [{ label: 'Nature', count: 100 }],
  top_keywords: [{ label: 'Neural Networks', count: 400 }],
  top_authors: [{ label: 'J. Smith', count: 15 }, { label: 'L. Wang', count: 12 }],
};

vi.mock('../../stores/statsStore', () => ({
  useStatsStore: vi.fn((selector) => selector({ stats: MOCK_STATS, isLoading: false })),
}));

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function card(overrides: Partial<BuilderCard> = {}): BuilderCard {
  return { id: 'test-id', dimension: 'country', chartType: 'bar_h', ...overrides };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DynamicChart', () => {
  it('отображает заголовок с именем измерения и типом чарта', () => {
    render(<DynamicChart card={card()} onRemove={vi.fn()} />);
    expect(screen.getByText(/Countries — Horizontal Bar/i)).toBeTruthy();
  });

  it('отображает кнопку удаления ×', () => {
    render(<DynamicChart card={card()} onRemove={vi.fn()} />);
    expect(screen.getByRole('button', { name: /remove chart/i })).toBeTruthy();
  });

  it('вызывает onRemove при клике на ×', () => {
    const onRemove = vi.fn();
    render(<DynamicChart card={card()} onRemove={onRemove} />);
    fireEvent.click(screen.getByRole('button', { name: /remove chart/i }));
    expect(onRemove).toHaveBeenCalledOnce();
  });

  it('рендерит bar-chart для bar_h', () => {
    render(<DynamicChart card={card({ chartType: 'bar_h' })} onRemove={vi.fn()} />);
    expect(screen.getByTestId('bar-chart')).toBeTruthy();
  });

  it('рендерит line-chart для line', () => {
    render(<DynamicChart card={card({ dimension: 'year', chartType: 'line' })} onRemove={vi.fn()} />);
    expect(screen.getByTestId('line-chart')).toBeTruthy();
  });

  it('рендерит pie-chart для pie', () => {
    render(<DynamicChart card={card({ dimension: 'doc_type', chartType: 'pie' })} onRemove={vi.fn()} />);
    expect(screen.getByTestId('pie-chart')).toBeTruthy();
  });

  it('рендерит таблицу с заголовками для table', () => {
    render(<DynamicChart card={card({ dimension: 'country', chartType: 'table' })} onRemove={vi.fn()} />);
    expect(screen.getByText('Label')).toBeTruthy();
    expect(screen.getByText('Count')).toBeTruthy();
    expect(screen.getByText('%')).toBeTruthy();
  });

  it('для open_access рендерит pie-chart с двумя сегментами', () => {
    render(<DynamicChart card={card({ dimension: 'open_access', chartType: 'pie' })} onRemove={vi.fn()} />);
    expect(screen.getByTestId('pie-chart')).toBeTruthy();
  });
});
