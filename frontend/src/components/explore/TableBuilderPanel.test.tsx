import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { TableBuilderPanel } from './TableBuilderPanel';
import { useAuthStore } from '../../stores/authStore';
import { useDashboardStore } from '../../stores/dashboardStore';
import { useStatsStore } from '../../stores/statsStore';
import { getPivot, postNlPivotQuery } from '../../api/stats';
import type { PivotResponse, StatsResponse } from '../../types/api';

vi.mock('../../api/stats', () => ({ getPivot: vi.fn(), postNlPivotQuery: vi.fn() }));

const MOCK_STATS: StatsResponse = {
  total_articles: 100,
  total_journals: 2,
  total_countries: 2,
  total_authors: 1,
  open_access_count: 40,
  by_year: [{ label: '2024', count: 50 }],
  by_journal: [{ label: 'Nature', count: 30 }],
  by_country: [{ label: 'China', count: 60 }],
  by_doc_type: [{ label: 'Article', count: 90 }],
  top_keywords: [],
  top_authors: [],
  by_year_top_countries: [],
  sunburst_country_open_access: [],
  top_journals_by_country: [],
  country_impact: [],
};

const MOCK_PIVOT: PivotResponse = {
  row_dim: 'year',
  col_dim: 'country',
  metric: 'count',
  row_labels: ['2024'],
  col_labels: ['China'],
  matrix: [[10]],
  cell_counts: [[10]],
  row_totals: [10],
  col_totals: [10],
};

beforeEach(() => {
  useDashboardStore.setState({ builderCards: [] });
  useStatsStore.setState({ stats: MOCK_STATS, isLoading: false, error: null });
  useAuthStore.setState({ isAuthenticated: true });
  vi.mocked(getPivot).mockReset();
  vi.mocked(getPivot).mockResolvedValue(MOCK_PIVOT);
  vi.mocked(postNlPivotQuery).mockReset();
});

describe('TableBuilderPanel — форма добавления', () => {
  it('не имеет базовых нарушений a11y в развёрнутом виде', async () => {
    const user = userEvent.setup();
    const { container } = render(<TableBuilderPanel />);
    // Разворачиваем панель для полной проверки формы
    await user.click(screen.getByRole('button', { name: 'Add table' }));
    
    // Запускаем axe против отрендеренного DOM-дерева
    expect(await axe(container)).toHaveNoViolations();
  });

  it('изначально показывает свёрнутую кнопку с текстом "Table Builder", без отдельного заголовка и без формы', () => {
    render(<TableBuilderPanel />);
    const trigger = screen.getByRole('button', { name: 'Add table' }); // aria-label стабилен для поиска
    expect(trigger).toHaveTextContent('Table Builder'); // видимый текст — заголовок, "Add table" не показан
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });

  it('клик разворачивает форму с 5 вариантами Rows и 4 вариантами Columns (без текущего Rows)', async () => {
    const user = userEvent.setup();
    render(<TableBuilderPanel />);
    await user.click(screen.getByRole('button', { name: 'Add table' }));

    const region = screen.getByRole('region');
    const selects = within(region).getAllByRole('combobox');
    // [0]=rows, [1]=cols, [2]=slicer (без value — none по умолчанию)
    expect(within(selects[0]).getAllByRole('option')).toHaveLength(5);
    expect(within(selects[1]).getAllByRole('option')).toHaveLength(4);
  });

  it('colDim никогда не предлагает текущий rowDim (валидная пара по построению)', async () => {
    const user = userEvent.setup();
    render(<TableBuilderPanel />);
    await user.click(screen.getByRole('button', { name: 'Add table' }));
    const region = screen.getByRole('region');
    const [rowsSelect, colsSelect] = within(region).getAllByRole('combobox');

    // Дефолт: rows=year, cols=country. Меняем rows на country (= текущему cols) —
    // cols должен автоматически смениться на что-то другое (не совпадать).
    await user.selectOptions(rowsSelect, 'country');
    expect((rowsSelect as HTMLSelectElement).value).toBe('country');
    expect((colsSelect as HTMLSelectElement).value).not.toBe('country');
  });

  it('slicer недоступен для уже выбранных rowDim/colDim', async () => {
    const user = userEvent.setup();
    render(<TableBuilderPanel />);
    await user.click(screen.getByRole('button', { name: 'Add table' }));
    const region = screen.getByRole('region');
    // [0]=rows, [1]=cols, [2]=metric, [3]=slicer dim
    const [, , , slicerSelect] = within(region).getAllByRole('combobox');
    // Дефолт rows=year, cols=country → slicer из оставшихся 3: doc_type/journal/open_access + "None"
    expect(within(slicerSelect).getAllByRole('option')).toHaveLength(4);
  });

  it('метрика по умолчанию — Count, доступны 2 варианта', async () => {
    const user = userEvent.setup();
    render(<TableBuilderPanel />);
    await user.click(screen.getByRole('button', { name: 'Add table' }));
    const region = screen.getByRole('region');
    const [, , metricSelect] = within(region).getAllByRole('combobox');
    expect((metricSelect as HTMLSelectElement).value).toBe('count');
    expect(within(metricSelect).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Count',
      'Avg. citations',
    ]);
  });

  it('выбор AVG(citations) передаётся в addBuilderCard', async () => {
    const user = userEvent.setup();
    render(<TableBuilderPanel />);
    await user.click(screen.getByRole('button', { name: 'Add table' }));
    const region = screen.getByRole('region');
    const [, , metricSelect] = within(region).getAllByRole('combobox');
    await user.selectOptions(metricSelect, 'avg_citations');
    await user.click(within(region).getByRole('button', { name: 'Add table' }));

    await waitFor(() => {
      expect(useDashboardStore.getState().builderCards).toHaveLength(1);
    });
    expect(useDashboardStore.getState().builderCards[0].metric).toBe('avg_citations');
  });

  it('добавление таблицы вызывает addBuilderCard и сворачивает форму', async () => {
    const user = userEvent.setup();
    render(<TableBuilderPanel />);
    await user.click(screen.getByRole('button', { name: 'Add table' }));
    await user.click(screen.getByRole('button', { name: 'Add table' }));

    await waitFor(() => {
      expect(useDashboardStore.getState().builderCards).toHaveLength(1);
    });
    const card = useDashboardStore.getState().builderCards[0];
    expect(card.rowDim).toBe('year');
    expect(card.colDim).toBe('country');
    expect(card.filterDim).toBeUndefined();

    // Форма свёрнута обратно — кнопка "+ Add table" видна, region пропал
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });

  it('выбор slicer-измерения и значения передаётся в addBuilderCard', async () => {
    const user = userEvent.setup();
    render(<TableBuilderPanel />);
    await user.click(screen.getByRole('button', { name: 'Add table' }));
    const region = screen.getByRole('region');
    const [, , , slicerSelect] = within(region).getAllByRole('combobox');
    await user.selectOptions(slicerSelect, 'doc_type');

    const valueSelect = within(region).getAllByRole('combobox')[4];
    await user.selectOptions(valueSelect, 'Article');

    await user.click(within(region).getByRole('button', { name: 'Add table' }));

    await waitFor(() => {
      expect(useDashboardStore.getState().builderCards).toHaveLength(1);
    });
    const card = useDashboardStore.getState().builderCards[0];
    expect(card.filterDim).toBe('doc_type');
    expect(card.filterValue).toBe('Article');
  });

  it('кнопка добавления отключена, пока не выбрано значение slicer\'а', async () => {
    const user = userEvent.setup();
    render(<TableBuilderPanel />);
    await user.click(screen.getByRole('button', { name: 'Add table' }));
    const region = screen.getByRole('region');
    const [, , , slicerSelect] = within(region).getAllByRole('combobox');
    await user.selectOptions(slicerSelect, 'doc_type');

    expect(within(region).getByRole('button', { name: 'Add table' })).toBeDisabled();
  });
});

describe('TableBuilderPanel — карточки', () => {
  it('рендерит карточку для каждой builderCard, запрашивает pivot с её параметрами', async () => {
    useDashboardStore.setState({
      builderCards: [{ id: 'c1', rowDim: 'year', colDim: 'country', filterDim: undefined, filterValue: undefined }],
    });
    render(<TableBuilderPanel />);

    await waitFor(() =>
      expect(getPivot).toHaveBeenCalledWith(
        expect.objectContaining({ rowDim: 'year', colDim: 'country' }),
        expect.any(AbortSignal),
      ),
    );
    expect(await screen.findByText('Year × Country')).toBeInTheDocument();
  });

  it('клик по кнопке удаления убирает карточку из dashboardStore', async () => {
    useDashboardStore.setState({
      builderCards: [{ id: 'c1', rowDim: 'year', colDim: 'country', filterDim: undefined, filterValue: undefined }],
    });
    const user = userEvent.setup();
    render(<TableBuilderPanel />);
    await screen.findByText('Year × Country');

    await user.click(screen.getByRole('button', { name: 'Remove table' }));
    expect(useDashboardStore.getState().builderCards).toHaveLength(0);
  });

  it('старая карточка без поля metric (localStorage до этой фичи) рендерится, запрашивает count', async () => {
    useDashboardStore.setState({
      // Намеренно без metric — симулирует BuilderCard, сохранённый до docs/impact-analytics/spec.md §1.2
      builderCards: [{ id: 'legacy', rowDim: 'year', colDim: 'country', filterDim: undefined, filterValue: undefined }],
    });
    render(<TableBuilderPanel />);

    await waitFor(() =>
      expect(getPivot).toHaveBeenCalledWith(expect.objectContaining({ metric: 'count' }), expect.any(AbortSignal)),
    );
    expect(await screen.findByText('Year × Country')).toBeInTheDocument();
  });

  it('когда есть карточки, заголовок виден отдельно, а свёрнутая кнопка показывает текст "Add table"', async () => {
    useDashboardStore.setState({
      builderCards: [{ id: 'c1', rowDim: 'year', colDim: 'country', filterDim: undefined, filterValue: undefined }],
    });
    render(<TableBuilderPanel />);
    await screen.findByText('Year × Country');

    expect(screen.getByRole('heading', { name: 'Table Builder' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add table' })).toHaveTextContent('Add table');
  });
});

describe('TableBuilderPanel — переключатель Manual/AI-enabled (docs/ai-nl-pivot/spec.md §4)', () => {
  it('по умолчанию открывается в ручном режиме (AddTableForm)', async () => {
    const user = userEvent.setup();
    render(<TableBuilderPanel />);
    await user.click(screen.getByRole('button', { name: 'Add table' }));

    expect(screen.getByRole('tab', { name: 'Manual', selected: true })).toBeInTheDocument();
    // AddTableForm — есть комбобоксы Rows/Columns; NlPivotQueryForm их не рендерит
    expect(screen.getAllByRole('combobox').length).toBeGreaterThan(0);
  });

  it('переключение на "AI-enabled" показывает NlPivotQueryForm вместо AddTableForm', async () => {
    const user = userEvent.setup();
    render(<TableBuilderPanel />);
    await user.click(screen.getByRole('button', { name: 'Add table' }));
    await user.click(screen.getByRole('tab', { name: 'AI-enabled' }));

    expect(screen.getByRole('tab', { name: 'AI-enabled', selected: true })).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('переключение обратно на Manual восстанавливает AddTableForm', async () => {
    const user = userEvent.setup();
    render(<TableBuilderPanel />);
    await user.click(screen.getByRole('button', { name: 'Add table' }));
    await user.click(screen.getByRole('tab', { name: 'AI-enabled' }));
    await user.click(screen.getByRole('tab', { name: 'Manual' }));

    expect(screen.getByRole('tab', { name: 'Manual', selected: true })).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getAllByRole('combobox').length).toBeGreaterThan(0);
  });

  it('успешный AI-запрос добавляет карточку и сворачивает форму, как ручной путь', async () => {
    vi.mocked(postNlPivotQuery).mockResolvedValue({
      row_dim: 'year',
      col_dim: 'country',
      filter_dim: null,
      filter_value: null,
      metric: 'count',
    });
    const user = userEvent.setup();
    render(<TableBuilderPanel />);
    await user.click(screen.getByRole('button', { name: 'Add table' }));
    await user.click(screen.getByRole('tab', { name: 'AI-enabled' }));
    await user.type(screen.getByRole('textbox'), 'articles per year and country');
    await user.click(screen.getByRole('button', { name: 'Generate' }));

    await waitFor(() => {
      expect(useDashboardStore.getState().builderCards).toHaveLength(1);
    });
    const card = useDashboardStore.getState().builderCards[0];
    expect(card.rowDim).toBe('year');
    expect(card.colDim).toBe('country');
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });
});
