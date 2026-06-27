import { renderHook } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useTheme } from './useTheme';
import { ThemeProvider } from '../components/theme/ThemeProvider';

function mockMedia() {
  vi.stubGlobal('matchMedia', vi.fn().mockImplementation((q: string) => ({
    matches: false,
    media: q,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as MediaQueryList)));
}

describe('useTheme', () => {
  beforeEach(() => {
    localStorage.clear();
    mockMedia();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns light theme and no-op toggleTheme without provider', () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('light');
    expect(result.current.toggleTheme).toBeTypeOf('function');
  });

  it('returns dark theme when provider reads dark from localStorage', () => {
    localStorage.setItem('theme', 'dark');
    const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider });
    expect(result.current.theme).toBe('dark');
  });

  it('returns light theme when provider reads light from localStorage', () => {
    localStorage.setItem('theme', 'light');
    const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider });
    expect(result.current.theme).toBe('light');
  });
});
