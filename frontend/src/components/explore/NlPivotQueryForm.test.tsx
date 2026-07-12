import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { NlPivotQueryForm } from './NlPivotQueryForm';
import { useAuthStore } from '../../stores/authStore';
import { postNlPivotQuery } from '../../api/stats';
import type { NlPivotQueryResponse } from '../../types/api';

vi.mock('../../api/stats', () => ({ postNlPivotQuery: vi.fn() }));

const mockedPost = vi.mocked(postNlPivotQuery);

function setAuthenticated(value: boolean) {
  useAuthStore.setState({ isAuthenticated: value });
}

beforeEach(() => {
  mockedPost.mockReset();
  setAuthenticated(true);
});

describe('NlPivotQueryForm — неавторизованный пользователь', () => {
  it('показывает приглашение войти вместо формы', () => {
    setAuthenticated(false);
    render(<NlPivotQueryForm onAdd={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByText('Sign in to use AI table generation.')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('не имеет базовых нарушений a11y', async () => {
    setAuthenticated(false);
    const { container } = render(<NlPivotQueryForm onAdd={vi.fn()} onCancel={vi.fn()} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('NlPivotQueryForm — авторизованный пользователь', () => {
  it('не имеет базовых нарушений a11y', async () => {
    const { container } = render(<NlPivotQueryForm onAdd={vi.fn()} onCancel={vi.fn()} />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('кнопка отправки отключена при пустом запросе', () => {
    render(<NlPivotQueryForm onAdd={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Generate' })).toBeDisabled();
  });

  it('показывает чипы всех 5 поддерживаемых измерений (docs/ai-nl-pivot/spec.md, bug-fix раунд п.5)', () => {
    render(<NlPivotQueryForm onAdd={vi.fn()} onCancel={vi.fn()} />);
    for (const label of ['Year', 'Country', 'Document Type', 'Journal', 'Open Access']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('справка развёрнута по умолчанию и сворачивается/разворачивается по клику', async () => {
    const user = userEvent.setup();
    render(<NlPivotQueryForm onAdd={vi.fn()} onCancel={vi.fn()} />);
    const toggle = screen.getByRole('button', { name: 'What can I ask?' });

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Year')).toBeInTheDocument();

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Year')).not.toBeInTheDocument();

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Year')).toBeInTheDocument();
  });

  it('успешный запрос вызывает onAdd с полями из ответа', async () => {
    mockedPost.mockResolvedValue({
      row_dim: 'doc_type',
      col_dim: 'open_access',
      filter_dim: 'country',
      filter_value: 'China',
      metric: 'avg_citations',
    });
    const onAdd = vi.fn();
    const user = userEvent.setup();
    render(<NlPivotQueryForm onAdd={onAdd} onCancel={vi.fn()} />);

    await user.type(screen.getByRole('textbox'), 'average citations by doc type and OA in China');
    await user.click(screen.getByRole('button', { name: 'Generate' }));

    await waitFor(() => expect(onAdd).toHaveBeenCalledWith({
      rowDim: 'doc_type',
      colDim: 'open_access',
      filterDim: 'country',
      filterValue: 'China',
      metric: 'avg_citations',
    }));
  });

  it('во время запроса кнопка показывает состояние загрузки и отключена', async () => {
    let resolvePromise: (value: NlPivotQueryResponse) => void = () => {};
    mockedPost.mockReturnValue(new Promise((resolve) => { resolvePromise = resolve; }));
    const user = userEvent.setup();
    render(<NlPivotQueryForm onAdd={vi.fn()} onCancel={vi.fn()} />);

    await user.type(screen.getByRole('textbox'), 'articles per year');
    await user.click(screen.getByRole('button', { name: 'Generate' }));

    expect(screen.getByRole('button', { name: 'Thinking…' })).toBeDisabled();
    resolvePromise({ row_dim: 'year', col_dim: 'country', filter_dim: null, filter_value: null, metric: 'count' });
  });

  it.each([
    [400, "Couldn't understand that — try rephrasing."],
    [429, 'AI query limit reached — try again later.'],
    [503, 'AI feature is temporarily unavailable.'],
    [500, 'Something went wrong — try again.'],
  ])('код ответа %i показывает соответствующее сообщение', async (status, expectedText) => {
    mockedPost.mockRejectedValue({ response: { status } });
    const user = userEvent.setup();
    render(<NlPivotQueryForm onAdd={vi.fn()} onCancel={vi.fn()} />);

    await user.type(screen.getByRole('textbox'), 'anything');
    await user.click(screen.getByRole('button', { name: 'Generate' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(expectedText);
  });

  it('клик Cancel вызывает onCancel', async () => {
    const onCancel = vi.fn();
    const user = userEvent.setup();
    render(<NlPivotQueryForm onAdd={vi.fn()} onCancel={onCancel} />);

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
  });
});
