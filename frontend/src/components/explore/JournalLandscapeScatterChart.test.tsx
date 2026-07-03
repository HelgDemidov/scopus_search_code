import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { JournalLandscapeScatterChart } from './JournalLandscapeScatterChart';
import { getJournalImpact } from '../../api/stats';
import type { JournalImpactPoint } from '../../types/api';

// Мок recharts — тестируем структуру/поведение, не реальный SVG (тот же паттерн,
// что TopJournalsByCountryChart.test.tsx/TopCountriesByYearChart.test.tsx).
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  ScatterChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="scatterchart">{children}</div>
  ),
  Scatter: ({ data }: { data: { journal: string }[] }) => (
    <div data-testid="scatter" data-count={data.length} data-journals={data.map((d) => d.journal).join(',')} />
  ),
  Cell: () => null,
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
              journal: 'Nature',
              count: 91,
              mean_citations: 80.79,
              median_citations: 52,
              quadrant: 'flagship',
              plotMean: 80.79,
            },
          },
        ],
      })}
    </div>
  ),
}));

// Мок ui/slider — реальный Radix Slider требует ResizeObserver (см. TopCountriesByYearChart.test.tsx)
vi.mock('../ui/slider', () => ({
  Slider: ({
    value,
    min,
    max,
    onValueChange,
  }: {
    value: number[];
    min: number;
    max: number;
    onValueChange: (v: number[]) => void;
  }) => (
    <div data-testid="maturity-slider" data-min={min} data-max={max} data-value={value.join(',')}>
      <button onClick={() => onValueChange([2022])}>set-2022</button>
    </div>
  ),
}));

vi.mock('../../api/stats', () => ({
  getJournalImpact: vi.fn(),
}));

const MOCK_POINTS: JournalImpactPoint[] = [
  { journal: 'Nature', count: 91, mean_citations: 80.79, median_citations: 52 },
  { journal: 'Proceedings of SPIE', count: 167, mean_citations: 1.82, median_citations: 1 },
];

beforeEach(() => {
  vi.mocked(getJournalImpact).mockReset();
  vi.mocked(getJournalImpact).mockResolvedValue(MOCK_POINTS);
});

describe('JournalLandscapeScatterChart — загрузка и рендер', () => {
  it('рендерит заголовок графика', async () => {
    render(<JournalLandscapeScatterChart />);
    expect(await screen.findByText('Journal Landscape')).toBeInTheDocument();
  });

  it('запрашивает данные с дефолтным max_year=2024 при монтировании', async () => {
    render(<JournalLandscapeScatterChart />);
    await waitFor(() => expect(getJournalImpact).toHaveBeenCalledWith(2024, expect.any(AbortSignal)));
  });

  it('рендерит Scatter с точками из ответа API', async () => {
    render(<JournalLandscapeScatterChart />);
    const scatter = await screen.findByTestId('scatter');
    expect(scatter).toHaveAttribute('data-count', '2');
    expect(scatter).toHaveAttribute('data-journals', 'Nature,Proceedings of SPIE');
  });

  it('пустой ответ API не падает (0 точек)', async () => {
    vi.mocked(getJournalImpact).mockResolvedValue([]);
    render(<JournalLandscapeScatterChart />);
    const scatter = await screen.findByTestId('scatter');
    expect(scatter).toHaveAttribute('data-count', '0');
  });
});

describe('JournalLandscapeScatterChart — слайдер окна зрелости', () => {
  it('слайдер зажат в [2022, 2024], дефолт 2024', async () => {
    render(<JournalLandscapeScatterChart />);
    const slider = await screen.findByTestId('maturity-slider');
    expect(slider).toHaveAttribute('data-min', '2022');
    expect(slider).toHaveAttribute('data-max', '2024');
    expect(slider).toHaveAttribute('data-value', '2024');
  });

  it('смена значения слайдера триггерит новый запрос с новым max_year', async () => {
    render(<JournalLandscapeScatterChart />);
    await waitFor(() => expect(getJournalImpact).toHaveBeenCalledWith(2024, expect.any(AbortSignal)));

    (await screen.findByText('set-2022')).click();

    await waitFor(() => expect(getJournalImpact).toHaveBeenCalledWith(2022, expect.any(AbortSignal)));
  });
});

describe('JournalLandscapeScatterChart — тултип', () => {
  it('показывает журнал, объём, среднее и медиану цитирований', async () => {
    render(<JournalLandscapeScatterChart />);
    const tooltip = await screen.findByTestId('tooltip');
    expect(tooltip.textContent).toContain('Nature');
    expect(tooltip.textContent).toContain('91');
    expect(tooltip.textContent).toContain('80.8'); // toFixed(1)
    expect(tooltip.textContent).toContain('52.0');
  });
});
