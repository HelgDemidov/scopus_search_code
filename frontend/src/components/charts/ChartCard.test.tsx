import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { ChartCard } from './ChartCard';

describe('ChartCard', () => {
  it('отображает заголовок', () => {
    render(<ChartCard title="Top Countries">content</ChartCard>);
    expect(screen.getByText('Top Countries')).toBeInTheDocument();
  });

  it('показывает skeleton вместо children при isLoading=true', () => {
    render(
      <ChartCard title="Test" isLoading>
        <div data-testid="chart-content">chart</div>
      </ChartCard>
    );
    expect(screen.queryByTestId('chart-content')).not.toBeInTheDocument();
  });

  it('показывает children при isLoading=false', () => {
    render(
      <ChartCard title="Test" isLoading={false}>
        <div data-testid="chart-content">chart</div>
      </ChartCard>
    );
    expect(screen.getByTestId('chart-content')).toBeInTheDocument();
  });

  it('рендерит цветной dot-маркер когда dimension задан', () => {
    const { container } = render(
      <ChartCard title="Test" dimension="country">content</ChartCard>
    );
    // Маркер — span с rounded-full и backgroundColor
    const dot = container.querySelector('span.rounded-full');
    expect(dot).toBeInTheDocument();
    expect((dot as HTMLElement).style.backgroundColor).toBeTruthy();
  });

  it('не рендерит dot-маркер без dimension', () => {
    const { container } = render(<ChartCard title="Test">content</ChartCard>);
    const dot = container.querySelector('span.rounded-full');
    expect(dot).not.toBeInTheDocument();
  });

  it('вызывает onTitleClick при нажатии на заголовок', async () => {
    const handler = vi.fn();
    render(<ChartCard title="Clickable" onTitleClick={handler}>content</ChartCard>);
    await userEvent.click(screen.getByText('Clickable'));
    expect(handler).toHaveBeenCalledOnce();
  });

  it('заголовок без onTitleClick не вызывает ошибку', async () => {
    render(<ChartCard title="Plain">content</ChartCard>);
    await userEvent.click(screen.getByText('Plain'));
    // Просто не падает
  });

  it('не имеет базовых нарушений a11y с кликабельным заголовком, dot-маркером и headerAction', async () => {
    // Комбинация всех интерактивных/декоративных элементов сразу — именно здесь
    // ранее был div/span с onClick вместо настоящего <button> (commit c3d3b4f).
    const { container } = render(
      <ChartCard
        title="Top Countries"
        dimension="country"
        onTitleClick={vi.fn()}
        headerAction={<button type="button">Remove</button>}
      >
        content
      </ChartCard>
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
