import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ThemeProvider } from './ThemeProvider';
import { useTheme } from '../../hooks/useTheme';

// Компонент-потребитель: отображает тему и кнопку переключения
function Consumer() {
  const { theme, toggleTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <button onClick={toggleTheme}>toggle</button>
    </div>
  );
}

// prefersColorSchemeDark — system preference; prefersReducedMotion — instant toggle
function mockMedia(prefersColorSchemeDark = false, prefersReducedMotion = false) {
  vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
    matches:
      query === '(prefers-color-scheme: dark)' ? prefersColorSchemeDark
      : query === '(prefers-reduced-motion: reduce)' ? prefersReducedMotion
      : false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as MediaQueryList)));
}

describe('ThemeProvider', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('defaults to light theme when no localStorage and no system preference', () => {
    mockMedia(false, false);
    render(<ThemeProvider><Consumer /></ThemeProvider>);
    expect(screen.getByTestId('theme')).toHaveTextContent('light');
  });

  it('initialises from localStorage value', () => {
    mockMedia(false, false);
    localStorage.setItem('theme', 'dark');
    render(<ThemeProvider><Consumer /></ThemeProvider>);
    expect(screen.getByTestId('theme')).toHaveTextContent('dark');
  });

  it('falls back to system preference when no localStorage', () => {
    mockMedia(true, false); // система предпочитает dark
    render(<ThemeProvider><Consumer /></ThemeProvider>);
    expect(screen.getByTestId('theme')).toHaveTextContent('dark');
  });

  it('applies dark class to <html> when theme is dark', async () => {
    mockMedia(false, false);
    localStorage.setItem('theme', 'dark');
    render(<ThemeProvider><Consumer /></ThemeProvider>);
    await waitFor(() => {
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });
  });

  it('toggle light→dark switches theme, persists to localStorage (reduced-motion)', async () => {
    mockMedia(false, true); // prefers-reduced-motion → мгновенно, без setTimeout
    render(<ThemeProvider><Consumer /></ThemeProvider>);
    await userEvent.click(screen.getByRole('button', { name: 'toggle' }));
    expect(screen.getByTestId('theme')).toHaveTextContent('dark');
    expect(localStorage.getItem('theme')).toBe('dark');
  });

  it('toggle dark→light removes dark class from <html> (reduced-motion)', async () => {
    mockMedia(false, true);
    localStorage.setItem('theme', 'dark');
    render(<ThemeProvider><Consumer /></ThemeProvider>);
    await waitFor(() => expect(document.documentElement.classList.contains('dark')).toBe(true));
    await userEvent.click(screen.getByRole('button', { name: 'toggle' }));
    expect(screen.getByTestId('theme')).toHaveTextContent('light');
    await waitFor(() => {
      expect(document.documentElement.classList.contains('dark')).toBe(false);
    });
  });

  it('first dark activation sets nightSkyActivated flag (reduced-motion)', async () => {
    mockMedia(false, true);
    render(<ThemeProvider><Consumer /></ThemeProvider>);
    await userEvent.click(screen.getByRole('button', { name: 'toggle' }));
    expect(localStorage.getItem('nightSkyActivated')).toBe('1');
  });

  it('nightSkyActivated flag is NOT set when toggling back to light (reduced-motion)', async () => {
    mockMedia(false, true);
    localStorage.setItem('theme', 'dark');
    localStorage.setItem('nightSkyActivated', '1');
    render(<ThemeProvider><Consumer /></ThemeProvider>);
    await userEvent.click(screen.getByRole('button', { name: 'toggle' }));
    // Флаг остаётся, он не сбрасывается при переходе обратно
    expect(localStorage.getItem('nightSkyActivated')).toBe('1');
  });
});
