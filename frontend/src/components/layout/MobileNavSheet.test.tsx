import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MobileNavSheet } from './MobileNavSheet';
import { useAuthStore } from '../../stores/authStore';
import i18n from '../../i18n';

// Sheet без портала — тот же приём, что в ArticleFilters.test.tsx
// (см. память [[feedback-jsdom-browser-api-mocks]]): содержимое всегда в DOM,
// не завязываемся на open-state Radix Dialog.
vi.mock('../ui/sheet', () => ({
  Sheet: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SheetTrigger: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) =>
    asChild ? children : <button>{children}</button>,
  SheetContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetClose: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) =>
    asChild ? children : <button>{children}</button>,
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

function renderMenu() {
  return render(
    <MemoryRouter>
      <MobileNavSheet />
    </MemoryRouter>,
  );
}

describe('MobileNavSheet', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    mockNavigate.mockClear();
    useAuthStore.setState({ isAuthenticated: false, user: null, logout: vi.fn() });
  });

  it('рендерит бургер-триггер с доступной подписью ≥44×44 (h-11 w-11)', () => {
    renderMenu();
    const trigger = screen.getByRole('button', { name: 'Open menu' });
    expect(trigger).toHaveClass('h-11', 'w-11');
  });

  it('бургер-триггер: скругленная рамка border (1px), не border-2', () => {
    renderMenu();
    const trigger = screen.getByRole('button', { name: 'Open menu' });
    expect(trigger).toHaveClass('border');
    expect(trigger).not.toHaveClass('border-2');
  });

  it('пункт меню "Explore": та же толщина рамки (border), но мягче цвет, чем у бургер-триггера', () => {
    renderMenu();
    const trigger = screen.getByRole('button', { name: 'Open menu' });
    const nav = screen.getByRole('navigation', { name: 'Menu' });
    const exploreLink = within(nav).getByRole('link', { name: 'Explore' });
    expect(exploreLink).toHaveClass('border');
    expect(trigger).toHaveClass('border-slate-400');
    expect(exploreLink).toHaveClass('border-slate-200');
  });

  it('аноним: показывает "Sign in", не показывает Sign out/аватар', () => {
    renderMenu();
    // Нет /:lang в URL (голый MemoryRouter) → LocalizedLink использует DEFAULT_URL_LANG
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/en/auth');
    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument();
  });

  it('аноним: пункт "Profile" не рендерится', () => {
    renderMenu();
    const nav = screen.getByRole('navigation', { name: 'Menu' });
    expect(within(nav).queryByRole('link', { name: 'Profile' })).not.toBeInTheDocument();
  });

  it('всегда показывает ссылку "Explore"', () => {
    renderMenu();
    const nav = screen.getByRole('navigation', { name: 'Menu' });
    expect(within(nav).getByRole('link', { name: 'Explore' })).toHaveAttribute('href', '/en/explore');
  });

  it('авторизован: показывает имя/email, "Profile" и "Sign out", не "Sign in"', () => {
    useAuthStore.setState({
      isAuthenticated: true,
      user: { id: 1, username: 'alice', email: 'alice@example.com', created_at: null },
      logout: vi.fn(),
    });
    renderMenu();

    expect(screen.getByText('alice')).toBeInTheDocument();
    expect(screen.getByText('alice@example.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument();

    const nav = screen.getByRole('navigation', { name: 'Menu' });
    expect(within(nav).getByRole('link', { name: 'Profile' })).toHaveAttribute('href', '/en/profile');
  });

  it('клик "Sign out" вызывает logout() и переход на "/en/main"', async () => {
    const mockLogout = vi.fn().mockResolvedValue(undefined);
    useAuthStore.setState({
      isAuthenticated: true,
      user: { id: 1, username: 'alice', email: 'alice@example.com', created_at: null },
      logout: mockLogout,
    });
    const { default: userEvent } = await import('@testing-library/user-event');
    renderMenu();

    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(mockLogout).toHaveBeenCalledTimes(1);
    // После logout isAuthenticated=false → useDefaultLandingPath возвращает '/main'
    expect(mockNavigate).toHaveBeenCalledWith('/en/main');
  });

  it('переключение языка на русский переводит пункты меню', async () => {
    await i18n.changeLanguage('ru');
    renderMenu();
    const nav = screen.getByRole('navigation', { name: 'Меню' });
    expect(within(nav).getByRole('link', { name: 'Аналитика' })).toBeInTheDocument();
    await i18n.changeLanguage('en');
  });
});
