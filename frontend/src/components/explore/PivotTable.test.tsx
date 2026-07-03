import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';
import { PivotTable } from './PivotTable';
import type { PivotResponse } from '../../types/api';

// PivotTable — чистый HTML (без Recharts), рендерится в jsdom без моков.
// CSV-скачивание (Blob/URL.createObjectURL/anchor.click) не тестируется здесь —
// не воспроизводимо в jsdom, генерация CSV-строки протестирована отдельно
// в tableBuilderData.test.ts (см. spec.md §4).

const SMALL_DATA: PivotResponse = {
  row_dim: 'country',
  col_dim: 'doc_type',
  row_labels: ['China', 'United States', 'Germany'],
  col_labels: ['Article', 'Review'],
  matrix: [
    [30, 5],
    [50, 2],
    [10, 1],
  ],
  row_totals: [35, 52, 11],
  col_totals: [90, 8],
};

function makeLargeData(rowCount: number): PivotResponse {
  const row_labels = Array.from({ length: rowCount }, (_, i) => `Country ${i}`);
  const matrix = row_labels.map((_, i) => [rowCount - i, i]);
  const row_totals = matrix.map((r) => r[0] + r[1]);
  return {
    row_dim: 'country',
    col_dim: 'doc_type',
    row_labels,
    col_labels: ['Article', 'Review'],
    matrix,
    row_totals,
    col_totals: [500, 500],
  };
}

describe('PivotTable — базовый рендер', () => {
  it('рендерит заголовок строки, заголовки столбцов и колонку Total', () => {
    render(<PivotTable data={SMALL_DATA} rowDim="country" colDim="doc_type" />);
    expect(screen.getByText('Country')).toBeInTheDocument();
    expect(screen.getByText('Article')).toBeInTheDocument();
    expect(screen.getByText('Review')).toBeInTheDocument();
    // "Total" встречается дважды (заголовок колонки + первая ячейка футера)
    expect(screen.getAllByText('Total')).toHaveLength(2);
  });

  it('рендерит строку по каждому row_label с ячейками и total', () => {
    render(<PivotTable data={SMALL_DATA} rowDim="country" colDim="doc_type" />);
    const row = screen.getByText('China').closest('tr')!;
    expect(within(row).getByText('30')).toBeInTheDocument();
    expect(within(row).getByText('5')).toBeInTheDocument();
    expect(within(row).getByText('35')).toBeInTheDocument();
  });

  it('футер показывает col_totals и grand total (сумма всех ячеек матрицы)', () => {
    const { container } = render(<PivotTable data={SMALL_DATA} rowDim="country" colDim="doc_type" />);
    const footerRow = container.querySelector<HTMLElement>('tfoot tr')!;
    expect(within(footerRow).getByText('90')).toBeInTheDocument();
    expect(within(footerRow).getByText('8')).toBeInTheDocument();
    // 30+5+50+2+10+1 = 98
    expect(within(footerRow).getByText('98')).toBeInTheDocument();
  });

  it('пустая матрица (нет row/col_labels) показывает emptyState вместо таблицы', () => {
    const empty: PivotResponse = { ...SMALL_DATA, row_labels: [], col_labels: [], matrix: [], row_totals: [], col_totals: [] };
    render(<PivotTable data={empty} rowDim="country" colDim="doc_type" />);
    expect(screen.getByText('No data for this combination.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});

describe('PivotTable — перевод меток', () => {
  it('переводит country/doc_type/open_access метки согласно текущему языку (en — без перевода)', () => {
    render(<PivotTable data={SMALL_DATA} rowDim="country" colDim="doc_type" />);
    // en: страны и типы документов не переводятся — как пришли с бэкенда
    expect(screen.getByText('China')).toBeInTheDocument();
    expect(screen.getByText('United States')).toBeInTheDocument();
  });
});

describe('PivotTable — сортировка', () => {
  it('по умолчанию сортирует по Total по убыванию (порядок бэкенда сохранён)', () => {
    render(<PivotTable data={SMALL_DATA} rowDim="country" colDim="doc_type" />);
    const rows = screen.getAllByRole('row').slice(1, -1); // без header и footer
    const labels = rows.map((r) => within(r).getAllByRole('cell')[0].textContent);
    expect(labels).toEqual(['United States', 'China', 'Germany']); // 52, 35, 11
  });

  it('клик по заголовку столбца сортирует строки по значению этого столбца (desc)', async () => {
    const user = userEvent.setup();
    render(<PivotTable data={SMALL_DATA} rowDim="country" colDim="doc_type" />);
    await user.click(screen.getByText('Review'));
    const rows = screen.getAllByRole('row').slice(1, -1);
    const labels = rows.map((r) => within(r).getAllByRole('cell')[0].textContent);
    // Review column: China=5, United States=2, Germany=1 → desc: China, United States, Germany
    expect(labels).toEqual(['China', 'United States', 'Germany']);
  });

  it('повторный клик по тому же заголовку переключает направление сортировки', async () => {
    const user = userEvent.setup();
    render(<PivotTable data={SMALL_DATA} rowDim="country" colDim="doc_type" />);
    await user.click(screen.getByText('Review'));
    await user.click(screen.getByText('Review'));
    const rows = screen.getAllByRole('row').slice(1, -1);
    const labels = rows.map((r) => within(r).getAllByRole('cell')[0].textContent);
    expect(labels).toEqual(['Germany', 'United States', 'China']); // asc: 1, 2, 5
  });

  it('третий клик по тому же заголовку сбрасывает сортировку на дефолтную (Total desc)', async () => {
    const user = userEvent.setup();
    render(<PivotTable data={SMALL_DATA} rowDim="country" colDim="doc_type" />);
    await user.click(screen.getByText('Review'));
    await user.click(screen.getByText('Review'));
    await user.click(screen.getByText('Review'));
    const rows = screen.getAllByRole('row').slice(1, -1);
    const labels = rows.map((r) => within(r).getAllByRole('cell')[0].textContent);
    expect(labels).toEqual(['United States', 'China', 'Germany']); // снова Total desc: 52, 35, 11
  });

  it('клик по заголовку строки (rowDimLabel) сортирует по алфавиту по возрастанию', async () => {
    const user = userEvent.setup();
    render(<PivotTable data={SMALL_DATA} rowDim="country" colDim="doc_type" />);
    await user.click(screen.getByText('Country'));
    const rows = screen.getAllByRole('row').slice(1, -1);
    const labels = rows.map((r) => within(r).getAllByRole('cell')[0].textContent);
    expect(labels).toEqual(['China', 'Germany', 'United States']);
  });
});

describe('PivotTable — поиск', () => {
  it('фильтрует строки по подстроке в метке (регистронезависимо)', async () => {
    const user = userEvent.setup();
    render(<PivotTable data={SMALL_DATA} rowDim="country" colDim="doc_type" />);
    await user.type(screen.getByPlaceholderText('Search rows…'), 'chi');
    expect(screen.getByText('China')).toBeInTheDocument();
    expect(screen.queryByText('Germany')).not.toBeInTheDocument();
    expect(screen.queryByText('United States')).not.toBeInTheDocument();
  });
});

describe('PivotTable — предупреждение о вырожденном результате', () => {
  it('показывает предупреждение, если непустых ячеек меньше 5', () => {
    const sparse: PivotResponse = {
      ...SMALL_DATA,
      matrix: [
        [1, 0],
        [0, 0],
        [0, 0],
      ],
    };
    render(<PivotTable data={sparse} rowDim="country" colDim="doc_type" />);
    expect(screen.getByText(/Few results for this filter/)).toBeInTheDocument();
  });

  it('не показывает предупреждение при 5+ непустых ячейках', () => {
    render(<PivotTable data={SMALL_DATA} rowDim="country" colDim="doc_type" />); // 6 непустых
    expect(screen.queryByText(/Few results for this filter/)).not.toBeInTheDocument();
  });
});

describe('PivotTable — пагинация', () => {
  it('при <= 15 строках пагинация не рендерится', () => {
    render(<PivotTable data={SMALL_DATA} rowDim="country" colDim="doc_type" />);
    expect(screen.queryByLabelText(/pagination/i)).not.toBeInTheDocument();
  });

  it('при > 15 строках показывает только первую страницу (15 строк)', () => {
    const large = makeLargeData(20);
    render(<PivotTable data={large} rowDim="country" colDim="doc_type" />);
    const rows = screen.getAllByRole('row').slice(1, -1);
    expect(rows).toHaveLength(15);
  });

  it('переход на вторую страницу показывает оставшиеся строки', async () => {
    const user = userEvent.setup();
    const large = makeLargeData(20);
    render(<PivotTable data={large} rowDim="country" colDim="doc_type" />);
    // PaginationLink рендерится как <a> без href — без роли "link" в a11y-дереве,
    // ищем внутри <nav aria-label="pagination"> вместо неоднозначного getByText.
    const nav = screen.getByRole('navigation', { name: 'pagination' });
    await user.click(within(nav).getByText('2'));
    const rows = screen.getAllByRole('row').slice(1, -1);
    expect(rows).toHaveLength(5);
  });
});

describe('PivotTable — CSV-экспорт', () => {
  it('кнопка экспорта CSV рендерится', () => {
    render(<PivotTable data={SMALL_DATA} rowDim="country" colDim="doc_type" />);
    expect(screen.getByRole('button', { name: 'Download CSV' })).toBeInTheDocument();
  });
});
