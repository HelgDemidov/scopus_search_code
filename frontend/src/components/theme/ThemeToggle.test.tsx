import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ThemeProvider } from './ThemeProvider';
import { ThemeToggle } from './ThemeToggle';

function mockMedia(prefersReducedMotion = false) {
  vi.stubGlobal('matchMedia', vi.fn().mockImplementation((q: string) => ({
    matches: q === '(prefers-reduced-motion: reduce)' ? prefersReducedMotion : false,
    media: q,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as MediaQueryList)));
}

function renderToggle() {
  return render(
    <ThemeProvider>
      <ThemeToggle />
    </ThemeProvider>,
  );
}

describe('ThemeToggle', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
    mockMedia(false);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows "Switch to dark mode" aria-label in light theme', () => {
    renderToggle();
    expect(screen.getByRole('button')).toHaveAttribute('aria-label', 'Switch to dark mode');
  });

  it('shows "Switch to light mode" aria-label in dark theme', () => {
    localStorage.setItem('theme', 'dark');
    renderToggle();
    expect(screen.getByRole('button')).toHaveAttribute('aria-label', 'Switch to light mode');
  });

  it('clicking in light mode switches to dark (reduced-motion)', async () => {
    mockMedia(true);
    renderToggle();
    await userEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('button')).toHaveAttribute('aria-label', 'Switch to light mode');
  });

  it('clicking in dark mode switches to light (reduced-motion)', async () => {
    localStorage.setItem('theme', 'dark');
    mockMedia(true);
    renderToggle();
    await userEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('button')).toHaveAttribute('aria-label', 'Switch to dark mode');
  });
});
