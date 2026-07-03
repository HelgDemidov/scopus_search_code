import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CountrySunburstChart } from './CountrySunburstChart';
import { useStatsStore } from '../../stores/statsStore';
import type { StatsResponse } from '../../types/api';

// Мок recharts — Pie рендерит свои Cell-children плюс атрибуты, достаточные, чтобы
// проверить группировку по кольцам и click-интерактивность (яркость), не завязываясь
// на реальный SVG (тот же паттерн, что DimensionDrawer.test.tsx). Наведение курсора
// (hover) больше не меняет заливку/обводку — тултип показывает Recharts сам,
// независимо от кастомного состояния компонента, поэтому onMouseEnter/onMouseLeave
// компоненту больше не нужны.
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  PieChart: ({ children }: { children: React.ReactNode }) => <div data-testid="piechart">{children}</div>,
  Pie: ({
    children,
    data,
    paddingAngle,
    onClick,
  }: {
    children: React.ReactNode;
    data: { key: string }[];
    paddingAngle: number;
    onClick: (d: unknown, index: number) => void;
  }) => (
    <div data-testid="pie" data-count={data.length} data-padding-angle={paddingAngle}>
      {data.map((d, i) => (
        <button key={d.key} data-testid="pie-trigger" onClick={() => onClick(d, i)}>
          {d.key}
        </button>
      ))}
      {children}
    </div>
  ),
  Cell: ({ fill, stroke, strokeWidth }: { fill: string; stroke: string; strokeWidth: number }) => (
    <div data-testid="cell" data-fill={fill} data-stroke={stroke} data-stroke-width={strokeWidth} />
  ),
  Tooltip: () => null,
}));

const MOCK_STATS = {
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
  sunburst_country_open_access: [
    { country: 'China', open_access: true, count: 80 },
    { country: 'China', open_access: false, count: 10 },
    { country: 'USA', open_access: true, count: 20 },
  ],
  top_journals_by_country: [],
} satisfies StatsResponse;

beforeEach(() => {
  useStatsStore.setState({ stats: null, isLoading: false, error: null });
});

describe('CountrySunburstChart — загрузка', () => {
  it('показывает skeleton, пока stats ещё не загружен', () => {
    render(<CountrySunburstChart />);
    expect(screen.queryByTestId('piechart')).not.toBeInTheDocument();
  });
});

describe('CountrySunburstChart — рендер колец (2 уровня: Country → OpenAccess)', () => {
  beforeEach(() => {
    useStatsStore.setState({ stats: MOCK_STATS, isLoading: false, error: null });
  });

  it('рендерит заголовок графика', () => {
    render(<CountrySunburstChart />);
    expect(screen.getByText('Country → Open Access')).toBeInTheDocument();
  });

  it('рендерит ровно 2 кольца (Pie)', () => {
    render(<CountrySunburstChart />);
    expect(screen.getAllByTestId('pie')).toHaveLength(2);
  });

  it('уровень 1 — по одному сегменту на страну', () => {
    render(<CountrySunburstChart />);
    const pies = screen.getAllByTestId('pie');
    expect(pies[0]).toHaveAttribute('data-count', '2'); // China, USA
  });

  it('уровень 2 — по одному сегменту на (страна, open_access), пропуская отсутствующие', () => {
    render(<CountrySunburstChart />);
    const pies = screen.getAllByTestId('pie');
    // China×true, China×false, USA×true (USA×false отсутствует в данных)
    expect(pies[1]).toHaveAttribute('data-count', '3');
  });

  it('оба кольца используют paddingAngle=0 (инвариант выравнивания границ между уровнями)', () => {
    render(<CountrySunburstChart />);
    const pies = screen.getAllByTestId('pie');
    expect(pies[0]).toHaveAttribute('data-padding-angle', '0');
    expect(pies[1]).toHaveAttribute('data-padding-angle', '0');
  });

  it('level2: крупнейший OA-сегмент страны наследует ровно её цвет из level1', () => {
    render(<CountrySunburstChart />);
    const pies = screen.getAllByTestId('pie');
    const level1Cell = pies[0].querySelectorAll('[data-testid="cell"]')[0]; // China
    const level2Cells = pies[1].querySelectorAll('[data-testid="cell"]');
    // China×true (80) — крупнейший OA-сегмент Китая, идёт первым в level2Raw
    expect(level2Cells[0]).toHaveAttribute('data-fill', level1Cell.getAttribute('data-fill'));
  });

  it('level2: второстепенный OA-сегмент имеет другой цвет, чем крупнейший (тот же country)', () => {
    render(<CountrySunburstChart />);
    const pies = screen.getAllByTestId('pie');
    const level2Cells = pies[1].querySelectorAll('[data-testid="cell"]');
    // China×true (major) vs China×false (minor) — разные оттенки
    expect(level2Cells[0].getAttribute('data-fill')).not.toBe(level2Cells[1].getAttribute('data-fill'));
  });

  it('обводка всегда тонкая (strokeWidth=1) — не меняется ни при наведении, ни при клике', () => {
    render(<CountrySunburstChart />);
    const cells = screen.getAllByTestId('cell');
    expect(cells.every((c) => c.getAttribute('data-stroke-width') === '1')).toBe(true);
  });

  it('наведение курсора (hover) НЕ меняет заливку — рамка при наведении убрана', async () => {
    const user = userEvent.setup();
    render(<CountrySunburstChart />);

    const fillsBefore = screen.getAllByTestId('cell').map((c) => c.getAttribute('data-fill'));
    const triggers = screen.getAllByTestId('pie-trigger');
    await user.hover(triggers[0]);

    const fillsAfter = screen.getAllByTestId('cell').map((c) => c.getAttribute('data-fill'));
    expect(fillsAfter).toEqual(fillsBefore);
  });

  it('клик по стране (level1) делает ярче саму страну И оба её дочерних OA-сегмента (level2)', async () => {
    const user = userEvent.setup();
    render(<CountrySunburstChart />);
    const pies = screen.getAllByTestId('pie');

    const level1CellBefore = pies[0].querySelectorAll('[data-testid="cell"]')[0]; // China
    const level2CellsBefore = pies[1].querySelectorAll('[data-testid="cell"]'); // China×true, China×false, USA×true
    const originalLevel1Fill = level1CellBefore.getAttribute('data-fill');
    const originalChinaTrueFill = level2CellsBefore[0].getAttribute('data-fill');
    const originalChinaFalseFill = level2CellsBefore[1].getAttribute('data-fill');
    const originalUsaFill = level2CellsBefore[2].getAttribute('data-fill');

    const level1Triggers = pies[0].querySelectorAll('[data-testid="pie-trigger"]');
    await user.click(level1Triggers[0]); // клик по China (level1)

    const level1CellAfter = pies[0].querySelectorAll('[data-testid="cell"]')[0];
    const level2CellsAfter = pies[1].querySelectorAll('[data-testid="cell"]');

    expect(level1CellAfter.getAttribute('data-fill')).not.toBe(originalLevel1Fill); // сам сегмент ярче
    expect(level2CellsAfter[0].getAttribute('data-fill')).not.toBe(originalChinaTrueFill); // дочерний ярче
    expect(level2CellsAfter[1].getAttribute('data-fill')).not.toBe(originalChinaFalseFill); // дочерний ярче
    expect(level2CellsAfter[2].getAttribute('data-fill')).toBe(originalUsaFill); // USA не тронута
  });

  it('клик по OA-сегменту (level2) делает ярче только его самого, не соседний OA-сегмент той же страны', async () => {
    const user = userEvent.setup();
    render(<CountrySunburstChart />);
    const pies = screen.getAllByTestId('pie');

    const level2CellsBefore = pies[1].querySelectorAll('[data-testid="cell"]');
    const originalChinaTrueFill = level2CellsBefore[0].getAttribute('data-fill');
    const originalChinaFalseFill = level2CellsBefore[1].getAttribute('data-fill');

    const level2Triggers = pies[1].querySelectorAll('[data-testid="pie-trigger"]');
    await user.click(level2Triggers[0]); // клик по China×OpenAccess=true (level2)

    const level2CellsAfter = pies[1].querySelectorAll('[data-testid="cell"]');
    expect(level2CellsAfter[0].getAttribute('data-fill')).not.toBe(originalChinaTrueFill); // сам сегмент ярче
    expect(level2CellsAfter[1].getAttribute('data-fill')).toBe(originalChinaFalseFill); // сосед не тронут
  });

  it('повторный клик по тому же сегменту снимает подсветку (toggle)', async () => {
    const user = userEvent.setup();
    render(<CountrySunburstChart />);
    const pies = screen.getAllByTestId('pie');

    const originalFill = pies[0].querySelectorAll('[data-testid="cell"]')[0].getAttribute('data-fill');
    const level1Triggers = pies[0].querySelectorAll('[data-testid="pie-trigger"]');

    await user.click(level1Triggers[0]);
    expect(pies[0].querySelectorAll('[data-testid="cell"]')[0].getAttribute('data-fill')).not.toBe(originalFill);

    await user.click(level1Triggers[0]);
    expect(pies[0].querySelectorAll('[data-testid="cell"]')[0].getAttribute('data-fill')).toBe(originalFill);
  });
});
