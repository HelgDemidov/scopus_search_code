import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { useMediaQuery } from './useMediaQuery';

// ---------------------------------------------------------------------------
// Хелпер: заглушка window.matchMedia
// Возвращает массив добавленных listeners для проверки cleanup.
// ---------------------------------------------------------------------------

function stubMatchMedia(matches: boolean) {
  const listeners: Array<(e: { matches: boolean }) => void> = [];

  vi.stubGlobal('matchMedia', (_query: string) => ({
    matches,
    media: _query,
    addEventListener: (_type: string, cb: (e: { matches: boolean }) => void) => {
      listeners.push(cb);
    },
    removeEventListener: (_type: string, cb: (e: { matches: boolean }) => void) => {
      const idx = listeners.indexOf(cb);
      if (idx !== -1) listeners.splice(idx, 1);
    },
    dispatchEvent: () => false,
  }));

  return listeners;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useMediaQuery', () => {
  it('возвращает true когда медиазапрос совпадает', () => {
    stubMatchMedia(true);
    const { result } = renderHook(() => useMediaQuery('(max-width: 767px)'));
    expect(result.current).toBe(true);
  });

  it('возвращает false когда медиазапрос не совпадает', () => {
    stubMatchMedia(false);
    const { result } = renderHook(() => useMediaQuery('(max-width: 767px)'));
    expect(result.current).toBe(false);
  });

  it('удаляет listener при размонтировании (cleanup)', () => {
    const listeners = stubMatchMedia(false);
    const { unmount } = renderHook(() => useMediaQuery('(max-width: 767px)'));

    expect(listeners).toHaveLength(1);
    unmount();
    expect(listeners).toHaveLength(0);
  });
});
