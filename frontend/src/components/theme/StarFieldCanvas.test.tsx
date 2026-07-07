import { render } from '@testing-library/react';
import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from 'vitest';
import { StarFieldCanvas } from './StarFieldCanvas';
import { ThemeProvider } from './ThemeProvider';
import { setBlackHole } from '../../stores/blackHoleStore';

// Каждое присвоение fillStyle пишется сюда, а не только финальное значение —
// renderCursorLensing тоже красит fillStyle (курсор), если он зарегистрирован
// последним в кадре, поэтому тест ищет '#000000' по всей истории, а не
// полагается на порядок отрисовки.
let fillStyleHistory: string[] = [];
let _fillStyle = '';

// Canvas rendering context stub — достаточно для утверждений о монтировании
const stubCtx = {
  clearRect: vi.fn(),
  beginPath: vi.fn(),
  closePath: vi.fn(),
  arc: vi.fn(),
  ellipse: vi.fn(),
  fill: vi.fn(),
  stroke: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  save: vi.fn(),
  restore: vi.fn(),
  scale: vi.fn(),
  createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
  get fillStyle() { return _fillStyle; },
  set fillStyle(v: string) { _fillStyle = v; fillStyleHistory.push(v); },
  strokeStyle: '',
  lineWidth: 0,
  lineCap: 'butt',
  shadowBlur: 0,
  shadowColor: '',
};

beforeAll(() => {
  // jsdom не реализует Canvas 2D — заменяем на заглушку
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    stubCtx as unknown as CanvasRenderingContext2D,
  );
  // RAF не запускает цикл в тестах — возвращает фиксированный id
  vi.stubGlobal('requestAnimationFrame', vi.fn().mockReturnValue(42));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.stubGlobal('ResizeObserver', class { observe = vi.fn(); disconnect = vi.fn(); });
  // prefers-reduced-motion: false → запускает RAF-ветку, а не ранний return
  vi.stubGlobal('matchMedia', vi.fn().mockImplementation((q: string) => ({
    matches: false,
    media: q,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as MediaQueryList)));
});

afterEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove('dark');
  vi.clearAllMocks();
  fillStyleHistory = [];
});

afterAll(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('StarFieldCanvas', () => {
  it('renders nothing in light theme', () => {
    // useTheme дефолтно возвращает light, провайдер не нужен
    const { container } = render(<StarFieldCanvas />);
    expect(container.firstChild).toBeNull();
  });

  it('renders <canvas> in dark theme', () => {
    localStorage.setItem('theme', 'dark');
    const { container } = render(
      <ThemeProvider>
        <StarFieldCanvas />
      </ThemeProvider>,
    );
    expect(container.querySelector('canvas')).toBeInTheDocument();
  });

  it('canvas has aria-hidden="true"', () => {
    localStorage.setItem('theme', 'dark');
    const { container } = render(
      <ThemeProvider>
        <StarFieldCanvas />
      </ThemeProvider>,
    );
    expect(container.querySelector('canvas')).toHaveAttribute('aria-hidden', 'true');
  });

  it('starts requestAnimationFrame on mount in dark mode', () => {
    localStorage.setItem('theme', 'dark');
    render(
      <ThemeProvider>
        <StarFieldCanvas />
      </ThemeProvider>,
    );
    expect(requestAnimationFrame).toHaveBeenCalled();
  });

  it('cancels animation frame on unmount', () => {
    localStorage.setItem('theme', 'dark');
    const { unmount } = render(
      <ThemeProvider>
        <StarFieldCanvas />
      </ThemeProvider>,
    );
    unmount();
    expect(cancelAnimationFrame).toHaveBeenCalled();
  });

  it('draws the black hole disk when one is registered (docs/error-experience/spec.md)', () => {
    localStorage.setItem('theme', 'dark');
    const captured: { loop: FrameRequestCallback | null } = { loop: null };
    vi.stubGlobal('requestAnimationFrame', vi.fn((cb: FrameRequestCallback) => {
      captured.loop = cb;
      return 42;
    }));

    setBlackHole({ xRatio: 0.5 });
    render(
      <ThemeProvider>
        <StarFieldCanvas />
      </ThemeProvider>,
    );

    expect(captured.loop).not.toBeNull();
    captured.loop?.(1000);

    // проверяем по истории присвоений, не по последнему значению (см.
    // комментарий у fillStyleHistory выше), что круг реально отрисовался
    expect(fillStyleHistory).toContain('#000000');

    setBlackHole(null);
  });
});
