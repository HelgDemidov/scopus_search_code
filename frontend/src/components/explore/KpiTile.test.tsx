import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { KpiTile } from './KpiTile';

const defaults = {
  label: 'Articles indexed',
  value: 39800,
  dimension: 'country' as const,
  isActive: false,
  onClick: vi.fn(),
};

describe('KpiTile', () => {
  it('отображает форматированное значение', () => {
    render(<KpiTile {...defaults} />);
    // formatCount(39800) = '39,800'
    expect(screen.getByText('39,800')).toBeInTheDocument();
  });

  it('отображает label', () => {
    render(<KpiTile {...defaults} />);
    expect(screen.getByText('Articles indexed')).toBeInTheDocument();
  });

  it('вызывает onClick при нажатии', async () => {
    const onClick = vi.fn();
    render(<KpiTile {...defaults} onClick={onClick} />);
    await userEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('aria-pressed=true когда isActive=true', () => {
    render(<KpiTile {...defaults} isActive />);
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true');
  });

  it('aria-pressed=false когда isActive=false', () => {
    render(<KpiTile {...defaults} isActive={false} />);
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'false');
  });

  it('показывает skeleton при isLoading=true', () => {
    const { container } = render(<KpiTile {...defaults} isLoading />);
    // Скелетоны — div с animate-pulse
    const pulses = container.querySelectorAll('.animate-pulse');
    expect(pulses.length).toBeGreaterThan(0);
    // Значение не показывается
    expect(screen.queryByText('39,800')).not.toBeInTheDocument();
  });

  it('цветная полоса использует base-цвет измерения', () => {
    const { container } = render(<KpiTile {...defaults} dimension="country" />);
    const stripe = container.querySelector('.rounded-full');
    expect(stripe).toBeInTheDocument();
    // DIMENSION_COLORS.country.base = '#16a34a'
    expect((stripe as HTMLElement).style.backgroundColor).toBe('rgb(22, 163, 74)');
  });

  it('фон кнопки всегда тонирован цветом измерения (~10% непрозрачности), даже когда не активна', () => {
    render(<KpiTile {...defaults} dimension="country" isActive={false} />);
    const button = screen.getByRole('button');
    // #16a34a + '1A' (~10% alpha) → rgba(22, 163, 74, 0.10196...)
    expect(button.style.backgroundColor).toMatch(/rgba\(22, 163, 74, 0\.1/);
  });

  it('активная плитка сохраняет тот же фон + получает boxShadow-кольцо', () => {
    render(<KpiTile {...defaults} dimension="country" isActive />);
    const button = screen.getByRole('button');
    expect(button.style.backgroundColor).toMatch(/rgba\(22, 163, 74, 0\.1/);
    expect(button.style.boxShadow).toContain('#16a34a');
  });
});
