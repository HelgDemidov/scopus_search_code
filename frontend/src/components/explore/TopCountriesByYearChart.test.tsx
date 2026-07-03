import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TopCountriesByYearChart } from './TopCountriesByYearChart';
import { useStatsStore } from '../../stores/statsStore';
import type { StatsResponse } from '../../types/api';

// Мок recharts — тестируем структуру/поведение, а не реальный SVG-рендеринг
// (тот же паттерн, что DimensionDrawer.test.tsx).
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  LineChart: ({ children }: { children: React.ReactNode }) => <div data-testid="linechart">{children}</div>,
  Line: ({ dataKey, hide }: { dataKey: string; hide?: boolean }) => (
    <div data-testid="line" data-key={dataKey} data-hide={String(!!hide)} />
  ),
  Legend: ({ onClick }: { onClick: (entry: { dataKey: string }) => void }) => (
    <div data-testid="legend">
      <button onClick={() => onClick({ dataKey: 'China' })}>toggle-china</button>
    </div>
  ),
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
}));

// Мок ui/slider — реальный Radix Slider требует ResizeObserver (см. DimensionDrawer.test.tsx)
vi.mock('../ui/slider', () => ({
  Slider: ({ value, min, max }: { value: number[]; min: number; max: number }) => (
    <div data-testid="year-slider" data-min={min} data-max={max} data-value={value.join(',')} />
  ),
}));

const MOCK_STATS = {
  total_articles: 1000,
  total_journals: 1,
  total_countries: 3,
  total_authors: 1,
  open_access_count: 1,
  by_year: [],
  by_journal: [],
  by_country: [],
  by_doc_type: [],
  top_keywords: [],
  top_authors: [],
  by_year_top_countries: [
    { year: 2022, country: 'China', count: 300 },
    { year: 2022, country: 'USA', count: 100 },
    { year: 2023, country: 'China', count: 400 },
    { year: 2023, country: 'USA', count: 120 },
    { year: 2023, country: 'India', count: 80 },
  ],
  sunburst_country_open_access: [],
  top_journals_by_country: [],
} satisfies StatsResponse;

// Заглушка window.matchMedia — по умолчанию desktop (не совпадает с mobile query);
// компонент использует useMediaQuery для уменьшения тултипа на мобильном (см.
// DimensionDrawer.test.tsx — тот же паттерн).
function stubMatchMedia(matches: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }));
}

beforeEach(() => {
  stubMatchMedia(false); // desktop
  useStatsStore.setState({ stats: null, isLoading: false, error: null });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('TopCountriesByYearChart — загрузка', () => {
  it('показывает skeleton, пока stats ещё не загружен', () => {
    render(<TopCountriesByYearChart />);
    expect(screen.queryByTestId('linechart')).not.toBeInTheDocument();
  });
});

describe('TopCountriesByYearChart — рендер данных', () => {
  beforeEach(() => {
    useStatsStore.setState({ stats: MOCK_STATS, isLoading: false, error: null });
  });

  it('рендерит заголовок графика', () => {
    render(<TopCountriesByYearChart />);
    expect(screen.getByText('Top Countries by Year')).toBeInTheDocument();
  });

  it('рендерит одну линию на каждую страну из by_year_top_countries', () => {
    render(<TopCountriesByYearChart />);
    const lines = screen.getAllByTestId('line');
    const keys = lines.map((l) => l.getAttribute('data-key')).sort();
    expect(keys).toEqual(['China', 'India', 'USA']);
  });

  it('слайдер: правый край зафиксирован на 2030, левый — на минимальном годе данных', () => {
    render(<TopCountriesByYearChart />);
    const slider = screen.getByTestId('year-slider');
    expect(slider).toHaveAttribute('data-max', '2030');
    expect(slider).toHaveAttribute('data-min', '2022');
  });

  it('дефолтное значение диапазона — [2022, 2030] (min(данных)=2022 > TOP_COUNTRIES_YEAR_DEFAULT_MIN=2015)', () => {
    render(<TopCountriesByYearChart />);
    expect(screen.getByTestId('year-slider')).toHaveAttribute('data-value', '2022,2030');
  });

  it('клик по легенде скрывает соответствующую линию (toggle hide)', async () => {
    const user = userEvent.setup();
    render(<TopCountriesByYearChart />);

    const chinaLine = () => screen.getAllByTestId('line').find((l) => l.getAttribute('data-key') === 'China')!;
    expect(chinaLine()).toHaveAttribute('data-hide', 'false');

    await user.click(screen.getByText('toggle-china'));
    expect(chinaLine()).toHaveAttribute('data-hide', 'true');

    // Повторный клик возвращает линию обратно
    await user.click(screen.getByText('toggle-china'));
    expect(chinaLine()).toHaveAttribute('data-hide', 'false');
  });
});

describe('TopCountriesByYearChart — дефолтный левый край слайдера (2015, не 2010)', () => {
  it('если данные уходят раньше 2015, дефолтный старт всё равно 2015 (не YEAR_DEFAULT_MIN=2010 из DimensionDrawer)', () => {
    const statsWithOldData = {
      ...MOCK_STATS,
      by_year_top_countries: [
        { year: 2005, country: 'China', count: 10 },
        { year: 2022, country: 'China', count: 300 },
      ],
    } satisfies StatsResponse;
    useStatsStore.setState({ stats: statsWithOldData, isLoading: false, error: null });

    render(<TopCountriesByYearChart />);
    const slider = screen.getByTestId('year-slider');
    expect(slider).toHaveAttribute('data-min', '2005'); // absoluteMin — можно раздвинуть до факта
    expect(slider).toHaveAttribute('data-value', '2015,2030'); // но дефолтный старт — 2015
  });
});
