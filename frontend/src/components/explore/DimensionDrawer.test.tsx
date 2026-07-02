import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DimensionDrawer } from './DimensionDrawer';
import { useDashboardStore } from '../../stores/dashboardStore';
import { useStatsStore } from '../../stores/statsStore';
import { DIMENSION_COLORS, getRankedBarColor, getTaxonomyColor } from '../charts/chartColors';
import type { Dimension } from '../charts/chartColors';
import type { StatsResponse } from '../../types/api';

// ---------------------------------------------------------------------------
// Mock recharts: тестируем структуру/поведение, а не реальный SVG-рендеринг
// (тот же паттерн, что в TopCountriesChart.test.tsx)
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Заглушка window.matchMedia — по умолчанию desktop (не совпадает с mobile query)
// ---------------------------------------------------------------------------
function stubMatchMedia(matches: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }));
}

// 18 строк на ранжированное измерение — больше TOP_N_RANKED=15, чтобы проверить обрезку
function rankedRows(prefix: string, n = 18) {
  return Array.from({ length: n }, (_, i) => ({ label: `${prefix}${i}`, count: 100 - i }));
}

const MOCK_STATS: StatsResponse = {
  total_articles: 1000,
  total_journals: 18,
  total_countries: 18,
  total_authors: 18,
  open_access_count: 400,
  by_year: [
    { label: '2023', count: 500 },
    { label: '2024', count: 500 },
  ],
  by_country: rankedRows('Country'),
  by_journal: rankedRows('Journal'),
  by_doc_type: [
    { label: 'Article', count: 600 },
    { label: 'Review', count: 250 },
    { label: 'Conference Paper', count: 150 },
  ],
  top_keywords: [],
  top_authors: rankedRows('Author'),
};

beforeEach(() => {
  stubMatchMedia(false); // desktop
  useStatsStore.setState({ stats: MOCK_STATS, isLoading: false, error: null });
  useDashboardStore.setState({ drawerDimension: null, activeSelection: null, builderCards: [] });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('DimensionDrawer — видимость', () => {
  it('ничего не рендерит когда drawerDimension=null', () => {
    render(<DimensionDrawer />);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});

describe('DimensionDrawer — обрезка топ-N (этап 6)', () => {
  it.each(['country', 'journal', 'author'] as Dimension[])(
    '%s: рендерит ровно 15 строк, даже если backend вернул 18',
    (dim) => {
      useDashboardStore.setState({ drawerDimension: dim });
      render(<DimensionDrawer />);
      expect(screen.getAllByTestId('cell')).toHaveLength(15);
    },
  );

  it('doc_type: НЕ режется — рендерит все категории (закрытая таксономия)', () => {
    useDashboardStore.setState({ drawerDimension: 'doc_type' });
    render(<DimensionDrawer />);
    expect(screen.getAllByTestId('cell')).toHaveLength(3);
  });

  it('open_access: ровно 2 сегмента (бинарная величина, не режется)', () => {
    useDashboardStore.setState({ drawerDimension: 'open_access' });
    render(<DimensionDrawer />);
    expect(screen.getAllByTestId('cell')).toHaveLength(2);
  });
});

describe('DimensionDrawer — типы графиков (этап 7)', () => {
  it('doc_type рендерит donut (Pie), а не bar chart', () => {
    useDashboardStore.setState({ drawerDimension: 'doc_type' });
    render(<DimensionDrawer />);
    expect(screen.getByTestId('piechart')).toBeInTheDocument();
    expect(screen.queryByTestId('barchart')).not.toBeInTheDocument();
  });

  it('year рендерит area chart', () => {
    useDashboardStore.setState({ drawerDimension: 'year' });
    render(<DimensionDrawer />);
    expect(screen.getByTestId('areachart')).toBeInTheDocument();
  });

  it('country/journal/author рендерят bar chart', () => {
    useDashboardStore.setState({ drawerDimension: 'country' });
    render(<DimensionDrawer />);
    expect(screen.getByTestId('barchart')).toBeInTheDocument();
  });
});

describe('DimensionDrawer — ranked-затухание цвета (этап 8)', () => {
  it('верхний ранг (index=0) — чистый base-цвет измерения', () => {
    useDashboardStore.setState({ drawerDimension: 'country' });
    render(<DimensionDrawer />);
    const cells = screen.getAllByTestId('cell');
    expect(cells[0]).toHaveAttribute('data-fill', DIMENSION_COLORS.country.base);
  });

  it('каждая строка совпадает с getRankedBarColor(dim, index, total, "light")', () => {
    useDashboardStore.setState({ drawerDimension: 'author' });
    render(<DimensionDrawer />);
    const cells = screen.getAllByTestId('cell');
    cells.forEach((cell, i) => {
      expect(cell).toHaveAttribute('data-fill', getRankedBarColor('author', i, cells.length, 'light'));
    });
  });

  it('doc_type donut использует качественную палитру (TAXONOMY_PALETTE), не ranked-затухание', () => {
    useDashboardStore.setState({ drawerDimension: 'doc_type' });
    render(<DimensionDrawer />);
    const cells = screen.getAllByTestId('cell');
    cells.forEach((cell, i) => {
      expect(cell).toHaveAttribute('data-fill', getTaxonomyColor(i));
    });
  });

  it('doc_type: крупные сегменты donut попарно различимы (не сливаются в один оттенок)', () => {
    useDashboardStore.setState({ drawerDimension: 'doc_type' });
    render(<DimensionDrawer />);
    const cells = screen.getAllByTestId('cell');
    const fills = cells.map((c) => c.getAttribute('data-fill'));
    expect(new Set(fills).size).toBe(fills.length);
  });
});

describe('DimensionDrawer — раздельные scroll-контейнеры chart/table (этап 4)', () => {
  it('таблица находится в отдельном overflow-y-auto контейнере, не содержащем сам чарт', () => {
    useDashboardStore.setState({ drawerDimension: 'journal' });
    render(<DimensionDrawer />);
    // Sheet рендерится через Portal в document.body, а не в container render() —
    // поэтому ищем через document.body, а не через RTL container.
    const table = screen.getByRole('table');
    const scrollContainer = table.closest('.overflow-y-auto');
    expect(scrollContainer).not.toBeNull();

    const chart = screen.getByTestId('barchart');
    expect(scrollContainer?.contains(chart)).toBe(false);

    // оба — потомки общего flex-контейнера с min-h-0 (иначе overflow-y-auto не работает)
    const minH0Wrapper = document.body.querySelector('.flex-1.min-h-0.flex.flex-col');
    expect(minH0Wrapper?.contains(chart)).toBe(true);
    expect(minH0Wrapper?.contains(table)).toBe(true);
  });
});
