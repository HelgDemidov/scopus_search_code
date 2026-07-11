import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { CountryImpactScatterChart } from './CountryImpactScatterChart';
import { useStatsStore } from '../../stores/statsStore';
import type { CountryImpactPoint, StatsResponse } from '../../types/api';

// Мок recharts — тот же паттерн, что JournalLandscapeScatterChart.test.tsx: тестируем
// структуру/поведение, не реальный SVG.
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  ScatterChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="scatterchart">{children}</div>
  ),
  Scatter: ({ data }: { data: { country: string }[] }) => (
    <div data-testid="scatter" data-count={data.length} data-countries={data.map((d) => d.country).join(',')} />
  ),
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  ReferenceLine: ({ x, y }: { x?: number; y?: number }) => (
    <div data-testid="reference-line" data-x={x} data-y={y} />
  ),
  Tooltip: ({ content }: { content: (p: unknown) => React.ReactNode }) => (
    <div data-testid="tooltip">
      {content({
        active: true,
        payload: [
          {
            payload: {
              country: 'USA',
              count: 91,
              mean_citations: 20.79,
              quadrant: 'flagship',
              plotMean: 20.79,
            },
          },
        ],
      })}
    </div>
  ),
}));

const MOCK_POINTS: CountryImpactPoint[] = [
  { country: 'USA', count: 91, mean_citations: 20.79 },
  { country: 'China', count: 167, mean_citations: 1.82 },
];

const BASE_STATS: Omit<StatsResponse, 'country_impact'> = {
  total_articles: 1000,
  total_journals: 1,
  total_countries: 2,
  total_authors: 1,
  open_access_count: 1,
  by_year: [],
  by_journal: [],
  by_country: [],
  by_doc_type: [],
  top_keywords: [],
  top_authors: [],
  by_year_top_countries: [],
  sunburst_country_open_access: [],
  top_journals_by_country: [],
};

beforeEach(() => {
  useStatsStore.setState({ stats: null, isLoading: false, error: null });
});

describe('CountryImpactScatterChart — загрузка', () => {
  it('показывает skeleton, пока stats ещё не загружен', () => {
    render(<CountryImpactScatterChart />);
    expect(screen.queryByTestId('scatter')).not.toBeInTheDocument();
  });
});

describe('CountryImpactScatterChart — рендер данных', () => {
  beforeEach(() => {
    useStatsStore.setState({
      stats: { ...BASE_STATS, country_impact: MOCK_POINTS },
      isLoading: false,
      error: null,
    });
  });

  it('рендерит заголовок графика', () => {
    render(<CountryImpactScatterChart />);
    expect(screen.getByText('Country Impact')).toBeInTheDocument();
  });

  it('рендерит Scatter с точками из country_impact', () => {
    render(<CountryImpactScatterChart />);
    const scatter = screen.getByTestId('scatter');
    expect(scatter).toHaveAttribute('data-count', '2');
    expect(scatter).toHaveAttribute('data-countries', 'USA,China');
  });

  it('пустой country_impact не падает (0 точек)', () => {
    useStatsStore.setState({ stats: { ...BASE_STATS, country_impact: [] }, isLoading: false, error: null });
    render(<CountryImpactScatterChart />);
    expect(screen.getByTestId('scatter')).toHaveAttribute('data-count', '0');
  });
});

describe('CountryImpactScatterChart — тултип', () => {
  it('показывает страну, объём и среднее цитирований (без медианы — нет в CountryImpactPoint)', () => {
    useStatsStore.setState({
      stats: { ...BASE_STATS, country_impact: MOCK_POINTS },
      isLoading: false,
      error: null,
    });
    render(<CountryImpactScatterChart />);
    const tooltip = screen.getByTestId('tooltip');
    expect(tooltip.textContent).toContain('USA');
    expect(tooltip.textContent).toContain('91');
    expect(tooltip.textContent).toContain('20.8'); // toFixed(1)
  });
});
