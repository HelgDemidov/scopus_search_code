import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TableBuilderPanel } from './TableBuilderPanel';
import { useDashboardStore } from '../../stores/dashboardStore';
import { useStatsStore } from '../../stores/statsStore';
import { getPivot } from '../../api/stats';
import type { PivotResponse, StatsResponse } from '../../types/api';

vi.mock('../../api/stats', () => ({ getPivot: vi.fn() }));

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
};

const MOCK_PIVOT: PivotResponse = {
  row_dim: 'year',
  col_dim: 'country',
  row_labels: ['2024'],
  col_labels: ['China'],
  matrix: [[10]],
  row_totals: [10],
  col_totals: [10],
};

beforeEach(() => {
  useDashboardStore.setState({ builderCards: [] });
  useStatsStore.setState({ stats: MOCK_STATS, isLoading: false, error: null });
  vi.mocked(getPivot).mockReset();
  vi.mocked(getPivot).mockResolvedValue(MOCK_PIVOT);
});

describe('TableBuilderPanel — форма добавления', () => {
  it('изначально показывает свёрнутую кнопку "Add table", без формы', () => {
    render(<TableBuilderPanel />);
    expect(screen.getByRole('button', { name: 'Add table' })).toBeInTheDocument();
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
    const [, , slicerSelect] = within(region).getAllByRole('combobox');
    // Дефолт rows=year, cols=country → slicer из оставшихся 3: doc_type/journal/open_access + "None"
    expect(within(slicerSelect).getAllByRole('option')).toHaveLength(4);
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
    const [, , slicerSelect] = within(region).getAllByRole('combobox');
    await user.selectOptions(slicerSelect, 'doc_type');

    const valueSelect = within(region).getAllByRole('combobox')[3];
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
    const [, , slicerSelect] = within(region).getAllByRole('combobox');
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
});
