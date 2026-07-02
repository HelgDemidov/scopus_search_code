import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Slider } from './slider';

// Radix Slider использует ResizeObserver (@radix-ui/react-use-size) для измерения
// толщины thumb — не полифиллен глобально в test/setup.ts, стаб только здесь
// (тот же паттерн, что в StarFieldCanvas.test.tsx).
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class {
    observe = vi.fn();
    disconnect = vi.fn();
    unobserve = vi.fn();
  });
});

describe('Slider', () => {
  it('рендерит два thumb-а для диапазона (двухбегунковый слайдер)', () => {
    render(<Slider value={[2010, 2030]} min={1965} max={2030} />);
    expect(screen.getAllByRole('slider')).toHaveLength(2);
  });

  it('рендерит один thumb для одиночного значения', () => {
    render(<Slider value={[50]} min={0} max={100} />);
    expect(screen.getAllByRole('slider')).toHaveLength(1);
  });

  it('передаёт min/max в оба thumb-а (aria-valuemin/aria-valuemax)', () => {
    render(<Slider value={[2010, 2030]} min={1965} max={2030} />);
    const thumbs = screen.getAllByRole('slider');
    thumbs.forEach((thumb) => {
      expect(thumb).toHaveAttribute('aria-valuemin', '1965');
      expect(thumb).toHaveAttribute('aria-valuemax', '2030');
    });
  });

  it('текущие значения отражаются в aria-valuenow каждого thumb-а', () => {
    render(<Slider value={[2010, 2030]} min={1965} max={2030} />);
    const thumbs = screen.getAllByRole('slider');
    expect(thumbs[0]).toHaveAttribute('aria-valuenow', '2010');
    expect(thumbs[1]).toHaveAttribute('aria-valuenow', '2030');
  });

  it('aria-label передаётся через props', () => {
    render(<Slider value={[2010, 2030]} min={1965} max={2030} aria-label="Диапазон лет" />);
    expect(screen.getByLabelText('Диапазон лет')).toBeInTheDocument();
  });

  it('структурные data-slot атрибуты присутствуют (root/track/range/thumb)', () => {
    const { container } = render(<Slider value={[2010, 2030]} min={1965} max={2030} />);
    expect(container.querySelector('[data-slot="slider"]')).toBeInTheDocument();
    expect(container.querySelector('[data-slot="slider-track"]')).toBeInTheDocument();
    expect(container.querySelector('[data-slot="slider-range"]')).toBeInTheDocument();
    expect(container.querySelectorAll('[data-slot="slider-thumb"]')).toHaveLength(2);
  });

  it('className потребителя доходит до корневого элемента', () => {
    const { container } = render(
      <Slider value={[2010, 2030]} min={1965} max={2030} className="consumer-class" />
    );
    expect(container.querySelector('[data-slot="slider"]')).toHaveClass('consumer-class');
  });
});
