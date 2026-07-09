import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import NotFoundPage from './NotFoundPage';
import { getBlackHole } from '../../stores/blackHoleStore';

// ErrorPanel (§10.4 post-prod, docs/layout-overhaul/spec.md) вызывает
// useMediaQuery('(min-width: 640px)') безусловно — jsdom не реализует
// matchMedia, нужна заглушка перед любым рендером страницы (тот же паттерн,
// что в ThemeToggle.test.tsx/useMediaQuery.test.ts).
function stubMatchMedia(matchesDesktop: boolean) {
  vi.stubGlobal('matchMedia', vi.fn().mockImplementation((q: string) => ({
    matches: q === '(min-width: 640px)' ? matchesDesktop : false,
    media: q,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as MediaQueryList)));
}

beforeEach(() => {
  stubMatchMedia(true);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderPage(path = '/this-page-does-not-exist') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <NotFoundPage />
    </MemoryRouter>,
  );
}

describe('NotFoundPage', () => {
  it('shows the NO SIGNAL status, the attempted path, and a home CTA', () => {
    renderPage('/mamba');
    expect(screen.getByText('NO SIGNAL')).toBeInTheDocument();
    expect(screen.getByText(/\/mamba/)).toBeInTheDocument();
    expect(screen.getByText('Page not found')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Go home' })).toBeInTheDocument();
  });

  it('shows an Explore collection link pointing to /explore', () => {
    renderPage('/mamba');
    const link = screen.getByRole('link');
    // Нет /:lang в URL (голый MemoryRouter) → LocalizedLink фоллбэчится на
    // текущий i18n.language (по умолчанию 'en' в тестах)
    expect(link).toHaveAttribute('href', '/en/explore');
  });

  // §10.4 post-prod (docs/layout-overhaul/spec.md): jsdom не считает layout —
  // "sm:hidden"/"hidden sm:inline" не скрывают элементы по-настоящему в
  // тестах (нет реального Tailwind CSS), поэтому проверяем ПРИСУТСТВИЕ
  // классов на нужных span, а не видимый на экране текст ссылки.
  it('renders a short primary label for narrow screens and the full label for sm+', () => {
    renderPage('/mamba');
    const link = screen.getByRole('link');
    expect(within(link).getByText('Explore')).toHaveClass('sm:hidden');
    expect(within(link).getByText('Explore collection')).toHaveClass('hidden', 'sm:inline');
  });

  // Пост-пост-фикс 2026-07-09 (§10, docs/layout-overhaul/spec.md): Go home
  // равна по ширине Explore collection на ВСЕХ размерах (не только ниже sm) —
  // раньше на ≥sm кнопка возвращалась к auto-ширине, оставляя неоправданно
  // широкий зазор между кнопками.
  it('lays out action buttons to share the row equally at every breakpoint (flex-1 basis-0)', () => {
    renderPage('/mamba');
    const homeButton = screen.getByRole('button', { name: 'Go home' });
    const exploreLink = screen.getByRole('link');
    expect(homeButton).toHaveClass('flex-1', 'basis-0');
    expect(homeButton).not.toHaveClass('sm:flex-none', 'sm:basis-auto');
    expect(exploreLink).toHaveClass('flex-1', 'basis-0');
    expect(exploreLink).not.toHaveClass('sm:flex-none', 'sm:basis-auto');
  });

  it('registers a black hole position on mount and clears it on unmount', () => {
    const { unmount } = renderPage();
    expect(getBlackHole()).not.toBeNull();
    unmount();
    expect(getBlackHole()).toBeNull();
  });
});
