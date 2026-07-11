import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { axe } from 'vitest-axe';
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

// Мок ui/slider: реальный Radix Slider требует ResizeObserver (не полифиллен
// глобально в test/setup.ts) — этот файл тестирует логику drawer'а/пропсы, не
// поведение самого слайдера (оно покрыто чистыми функциями getYearRangeBounds/
// zeroFillYears в chartColors.test.ts). Мок вызывает onValueChange по клику —
// достаточно, чтобы проверить, что DrawerAreaChart действительно перерисовывает
// диапазон по колбэку.
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
  // Разреженный историчный год + недавний кластер — как в реальных данных
  // (реальный min(year) на проде — 1965, ровно 1 статья, см. spec.md §14 п.6).
  by_year: [
    { label: '1965', count: 1 },
    { label: '2023', count: 500 },
    { label: '2024', count: 499 },
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
  by_year_top_countries: [],
  sunburst_country_open_access: [],
  top_journals_by_country: [],
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
  it.each(['journal', 'author'] as Dimension[])(
    '%s: рендерит ровно 15 строк, даже если backend вернул 18',
    (dim) => {
      useDashboardStore.setState({ drawerDimension: dim });
      render(<DimensionDrawer />);
      expect(screen.getAllByTestId('cell')).toHaveLength(15);
    },
  );

  it('country: график (Cell) показывает топ-10, даже если backend вернул 18 (post-prod §14 п.4)', () => {
    useDashboardStore.setState({ drawerDimension: 'country' });
    render(<DimensionDrawer />);
    expect(screen.getAllByTestId('cell')).toHaveLength(10);
  });

  it('country: таблица под графиком по-прежнему показывает топ-15 (не режется вместе с графиком)', () => {
    useDashboardStore.setState({ drawerDimension: 'country' });
    render(<DimensionDrawer />);
    expect(screen.getAllByRole('row')).toHaveLength(16); // 1 заголовок + 15 строк данных
  });

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

describe('DimensionDrawer — year range-слайдер (post-prod §14 п.6)', () => {
  it('по умолчанию диапазон 2010–2030 (min(year)=1965 в тестовых данных, дефолт не выходит за реальный минимум)', () => {
    useDashboardStore.setState({ drawerDimension: 'year' });
    render(<DimensionDrawer />);
    const labels = within(screen.getByTestId('year-range-labels'));
    expect(labels.getByText('2010')).toBeInTheDocument();
    expect(labels.getByText('2030')).toBeInTheDocument();
  });

  it('слайдер получает min=absoluteMinYear (1965) и max=2030 (хардкод, не от данных)', () => {
    useDashboardStore.setState({ drawerDimension: 'year' });
    render(<DimensionDrawer />);
    const slider = screen.getByTestId('year-slider');
    expect(slider).toHaveAttribute('data-min', '1965');
    expect(slider).toHaveAttribute('data-max', '2030');
    expect(slider).toHaveAttribute('data-value', '2010,2030');
  });

  it('изменение диапазона через слайдер (onValueChange) обновляет отображаемые годы', async () => {
    useDashboardStore.setState({ drawerDimension: 'year' });
    render(<DimensionDrawer />);
    await userEvent.click(screen.getByText('expand-to-max'));
    // expand-to-max в моке слайдера вызывает onValueChange([min, max]) = [1965, 2030]
    const labels = within(screen.getByTestId('year-range-labels'));
    expect(labels.getByText('1965')).toBeInTheDocument();
    expect(labels.getByText('2030')).toBeInTheDocument();
    expect(labels.queryByText('2010')).not.toBeInTheDocument();
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

  it('country: затухание считается от total=10 (число колонок на графике), не от 15 (размер таблицы)', () => {
    useDashboardStore.setState({ drawerDimension: 'country' });
    render(<DimensionDrawer />);
    const cells = screen.getAllByTestId('cell');
    expect(cells).toHaveLength(10);
    cells.forEach((cell, i) => {
      expect(cell).toHaveAttribute('data-fill', getRankedBarColor('country', i, 10, 'light'));
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

describe('DimensionDrawer — a11y', () => {
  // Sheet рендерится через Radix Portal в document.body, не в RTL container
  // (см. комментарий в тесте выше) — axe(container) проверил бы пустой div
  // и не поймал бы ни одного нарушения внутри самого drawer'а. Обязательно
  // axe(document.body).
  it('year: не имеет базовых нарушений a11y (Slider + area chart + range-labels)', async () => {
    useDashboardStore.setState({ drawerDimension: 'year' });
    render(<DimensionDrawer />);
    expect(await axe(document.body)).toHaveNoViolations();
  });

  it('doc_type: не имеет базовых нарушений a11y (donut + Legend, отдельная flex-ветка рендера)', async () => {
    useDashboardStore.setState({ drawerDimension: 'doc_type' });
    render(<DimensionDrawer />);
    expect(await axe(document.body)).toHaveNoViolations();
  });
});
