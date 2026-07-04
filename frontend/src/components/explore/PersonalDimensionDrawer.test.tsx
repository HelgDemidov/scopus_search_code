import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PersonalDimensionDrawer } from './DimensionDrawer';
import { useDashboardStore } from '../../stores/dashboardStore';
import type { SearchStatsResponse } from '../../types/api';

// Тот же мок recharts, что DimensionDrawer.test.tsx — PersonalDimensionDrawer
// рендерит ту же общую сердцевину (DimensionDrawerCore), различие только в
// источнике данных (props вместо useStatsStore), см. docs/explore-personal-
// redesign/spec.md §1.2.
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  BarChart: ({ children }: { children: React.ReactNode }) => <div data-testid="barchart">{children}</div>,
  Bar: ({ children }: { children: React.ReactNode }) => <div data-testid="bar">{children}</div>,
  AreaChart: ({ children }: { children: React.ReactNode }) => <div data-testid="areachart">{children}</div>,
  Area: () => <div data-testid="area" />,
  PieChart: ({ children }: { children: React.ReactNode }) => <div data-testid="piechart">{children}</div>,
  Pie: ({ children }: { children: React.ReactNode }) => <div data-testid="pie">{children}</div>,
  Cell: ({ fill }: { fill: string }) => <div data-testid="cell" data-fill={fill} />,
  Legend: () => <div data-testid="legend" />,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
}));

vi.mock('../ui/slider', () => ({
  Slider: ({ value, onValueChange, min, max }: {
    value: number[];
    onValueChange: (v: number[]) => void;
    min: number;
    max: number;
  }) => (
    <div data-testid="year-slider" data-min={min} data-max={max} data-value={value.join(',')}>
      <button onClick={() => onValueChange([min, max])}>expand-to-max</button>
    </div>
  ),
}));

function stubMatchMedia(matches: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }));
}

const MOCK_STATS: SearchStatsResponse = {
  total: 50,
  by_year: [{ label: '2023', count: 30 }, { label: '2024', count: 20 }],
  by_country: [{ label: 'Germany', count: 5 }, { label: 'USA', count: 3 }],
  by_journal: [{ label: 'Nature', count: 3 }, { label: 'IEEE Access', count: 2 }],
  by_doc_type: [{ label: 'Article', count: 40 }, { label: 'Review', count: 10 }],
  by_open_access: [
    { label: 'true', count: 18 },
    { label: 'false', count: 32 },
  ],
};

beforeEach(() => {
  stubMatchMedia(false); // desktop
  useDashboardStore.setState({ drawerDimension: null, activeSelection: null, builderCards: [] });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PersonalDimensionDrawer — видимость', () => {
  it('ничего не рендерит когда drawerDimension=null', () => {
    render(<PersonalDimensionDrawer stats={MOCK_STATS} />);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('stats=null не падает (drawer просто пуст)', () => {
    useDashboardStore.setState({ drawerDimension: 'country' });
    render(<PersonalDimensionDrawer stats={null} />);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});

describe('PersonalDimensionDrawer — open_access из by_open_access (личный источник данных)', () => {
  it('строит ровно 2 сегмента из label true/false, а не из скалярных open_access_count/total_articles', () => {
    useDashboardStore.setState({ drawerDimension: 'open_access' });
    render(<PersonalDimensionDrawer stats={MOCK_STATS} />);
    const cells = screen.getAllByTestId('cell');
    expect(cells).toHaveLength(2);
    // Таблица под donut показывает count в отдельных строках — 18 (OA) и 32 (не-OA)
    expect(screen.getByText('18')).toBeInTheDocument();
    expect(screen.getByText('32')).toBeInTheDocument();
  });
});

describe('PersonalDimensionDrawer — измерения без author', () => {
  it('country рендерит bar chart из личных данных', () => {
    useDashboardStore.setState({ drawerDimension: 'country' });
    render(<PersonalDimensionDrawer stats={MOCK_STATS} />);
    expect(screen.getByTestId('barchart')).toBeInTheDocument();
  });

  it('year рендерит area chart', () => {
    useDashboardStore.setState({ drawerDimension: 'year' });
    render(<PersonalDimensionDrawer stats={MOCK_STATS} />);
    expect(screen.getByTestId('areachart')).toBeInTheDocument();
  });

  it('doc_type рендерит donut (Pie)', () => {
    useDashboardStore.setState({ drawerDimension: 'doc_type' });
    render(<PersonalDimensionDrawer stats={MOCK_STATS} />);
    expect(screen.getByTestId('piechart')).toBeInTheDocument();
  });

  it('author физически недостижим из personal UI, но не роняет drawer, если стор всё же в этом состоянии (top_authors отсутствует)', () => {
    useDashboardStore.setState({ drawerDimension: 'author' });
    render(<PersonalDimensionDrawer stats={MOCK_STATS} />);
    // Пустой массив top_authors ?? [] — рендерится пустая таблица, без падения
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.queryAllByTestId('cell')).toHaveLength(0);
  });
});
