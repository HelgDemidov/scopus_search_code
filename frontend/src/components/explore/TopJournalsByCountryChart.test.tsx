import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TopJournalsByCountryChart } from './TopJournalsByCountryChart';
import { useStatsStore } from '../../stores/statsStore';
import type { StatsResponse } from '../../types/api';

// Мок recharts — тестируем структуру/поведение (тот же паттерн, что DimensionDrawer.test.tsx).
// Tooltip рендерит переданный content(...) с синтетическим payload в ТОМ ЖЕ порядке,
// что и стек бара (Other первым — см. pivotJournalCountryData), чтобы проверить, что
// компонент сам сортирует "Other" в конец списка тултипа, а не полагается на порядок payload.
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  BarChart: ({ children, data }: { children: React.ReactNode; data: { journal: string }[] }) => (
    <div data-testid="barchart" data-journals={data.map((d) => d.journal).join(',')}>
      {children}
    </div>
  ),
  Bar: ({ dataKey }: { dataKey: string }) => <div data-testid="bar" data-key={dataKey} />,
  Legend: () => <div data-testid="legend" />,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: ({ content }: { content: (p: unknown) => React.ReactNode }) => (
    <div data-testid="tooltip">
      {content({
        active: true,
        label: 'Nature',
        payload: [
          { dataKey: 'Other', value: 5, color: '#64748b' },
          { dataKey: 'China', value: 30, color: 'hsl(0, 65%, 42%)' },
          { dataKey: 'USA', value: 10, color: 'hsl(275, 65%, 42%)' },
        ],
      })}
    </div>
  ),
}));

const MOCK_STATS = {
  total_articles: 1000,
  total_journals: 1,
  total_countries: 1,
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
  top_journals_by_country: [
    { journal: 'Nature', country: 'China', count: 30 },
    { journal: 'Nature', country: 'USA', count: 10 },
    { journal: 'Science', country: 'USA', count: 25 },
    { journal: 'Science', country: 'Other', count: 5 },
  ],
} satisfies StatsResponse;

beforeEach(() => {
  useStatsStore.setState({ stats: null, isLoading: false, error: null });
});

describe('TopJournalsByCountryChart — загрузка', () => {
  it('показывает skeleton, пока stats ещё не загружен', () => {
    render(<TopJournalsByCountryChart />);
    expect(screen.queryByTestId('barchart')).not.toBeInTheDocument();
  });
});

describe('TopJournalsByCountryChart — рендер данных', () => {
  beforeEach(() => {
    useStatsStore.setState({ stats: MOCK_STATS, isLoading: false, error: null });
  });

  it('рендерит заголовок графика', () => {
    render(<TopJournalsByCountryChart />);
    expect(screen.getByText('Top Journals by Country')).toBeInTheDocument();
  });

  it('рендерит бары по журналам, упорядоченным по убыванию суммарного объёма', () => {
    render(<TopJournalsByCountryChart />);
    // Nature: 30+10=40, Science: 25+5=30 → Nature первым
    expect(screen.getByTestId('barchart')).toHaveAttribute('data-journals', 'Nature,Science');
  });

  it('рендерит один Bar (сегмент стека) на каждую страну + Other', () => {
    render(<TopJournalsByCountryChart />);
    const bars = screen.getAllByTestId('bar');
    const keys = bars.map((b) => b.getAttribute('data-key'));
    expect(keys).toEqual(expect.arrayContaining(['China', 'USA', 'Other']));
    expect(keys).toHaveLength(3);
  });

  it('"Other" — первый Bar в стеке (нижний сегмент)', () => {
    render(<TopJournalsByCountryChart />);
    const bars = screen.getAllByTestId('bar');
    expect(bars[0]).toHaveAttribute('data-key', 'Other');
  });

  it('в тултипе "Other" — последняя строка списка, даже если payload отдаёт её первой (порядок стека)', () => {
    render(<TopJournalsByCountryChart />);
    const tooltip = screen.getByTestId('tooltip');
    // Мок Tooltip передаёт content payload в порядке Other, China, USA (как в стеке)
    const text = tooltip.textContent ?? '';
    const otherIdx = text.indexOf('Other');
    const chinaIdx = text.indexOf('China');
    const usaIdx = text.indexOf('USA');
    expect(chinaIdx).toBeGreaterThanOrEqual(0);
    expect(usaIdx).toBeGreaterThanOrEqual(0);
    expect(otherIdx).toBeGreaterThan(chinaIdx);
    expect(otherIdx).toBeGreaterThan(usaIdx);
  });
});
