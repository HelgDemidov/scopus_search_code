import { render } from '@testing-library/react';
import { useRef } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useBlackHoleMessageAnchor } from './useBlackHoleMessageAnchor';
import { getMessageBottom, setBlackHole } from '../stores/blackHoleStore';
import i18n from '../i18n';

function mockRectBottom(bottom: number) {
  return { bottom } as unknown as DOMRect;
}

function AnchorProbe() {
  const ref = useRef<HTMLDivElement>(null);
  useBlackHoleMessageAnchor(ref);
  return <div ref={ref} />;
}

describe('useBlackHoleMessageAnchor', () => {
  beforeEach(() => {
    setBlackHole({ xRatio: 0.7 });
  });

  afterEach(() => {
    setBlackHole(null);
    vi.restoreAllMocks();
  });

  it('измеряет bottom контейнера и пишет в blackHoleStore при монтировании', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(mockRectBottom(321));
    render(<AnchorProbe />);
    expect(getMessageBottom()).toBe(321);
  });

  it('сбрасывает messageBottom в null при размонтировании', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(mockRectBottom(200));
    const { unmount } = render(<AnchorProbe />);
    expect(getMessageBottom()).toBe(200);
    unmount();
    expect(getMessageBottom()).toBeNull();
  });

  it('пересчитывает при resize (адрес-бар/поворот меняют высоту сообщения)', () => {
    const spy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect');
    spy.mockReturnValue(mockRectBottom(100));
    render(<AnchorProbe />);
    expect(getMessageBottom()).toBe(100);

    spy.mockReturnValue(mockRectBottom(250));
    window.dispatchEvent(new Event('resize'));
    expect(getMessageBottom()).toBe(250);
  });

  it('пересчитывает при orientationchange', () => {
    const spy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect');
    spy.mockReturnValue(mockRectBottom(120));
    render(<AnchorProbe />);
    expect(getMessageBottom()).toBe(120);

    spy.mockReturnValue(mockRectBottom(180));
    window.dispatchEvent(new Event('orientationchange'));
    expect(getMessageBottom()).toBe(180);
  });

  it('пересчитывает при смене языка i18n (RU/sr-Latn переносят текст на 2 строки)', async () => {
    const spy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect');
    spy.mockReturnValue(mockRectBottom(150));
    render(<AnchorProbe />);
    expect(getMessageBottom()).toBe(150);

    spy.mockReturnValue(mockRectBottom(300));
    await i18n.changeLanguage('ru');
    expect(getMessageBottom()).toBe(300);
    await i18n.changeLanguage('en');
  });

  it('перестаёт писать после unmount, даже если resize приходит позже (cancelled-guard)', () => {
    const spy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect');
    spy.mockReturnValue(mockRectBottom(100));
    const { unmount } = render(<AnchorProbe />);
    unmount();

    spy.mockReturnValue(mockRectBottom(999));
    window.dispatchEvent(new Event('resize'));
    expect(getMessageBottom()).toBeNull();
  });

  it('не падает, если ref ещё ни на что не указывает', () => {
    function EmptyRefProbe() {
      const ref = useRef<HTMLDivElement>(null);
      useBlackHoleMessageAnchor(ref);
      return null;
    }
    expect(() => render(<EmptyRefProbe />)).not.toThrow();
    expect(getMessageBottom()).toBeNull();
  });
});
