import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import MainPage from './MainPage';

let authIsAuthenticated = false;
vi.mock('../stores/authStore', () => ({
  useAuthStore: (selector: (s: { isAuthenticated: boolean }) => unknown) =>
    selector({ isAuthenticated: authIsAuthenticated }),
}));

function renderPage() {
  return render(
    <HelmetProvider>
      <MemoryRouter>
        <MainPage />
      </MemoryRouter>
    </HelmetProvider>,
  );
}

beforeEach(() => {
  authIsAuthenticated = false;
});

describe('MainPage', () => {
  it('рендерит заголовок/подзаголовок героя', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: /Discover AI & Neural Network Research/i })).toBeInTheDocument();
  });

  it('анонимный пользователь видит обе CTA-кнопки: Start searching и Sign in', () => {
    renderPage();
    // Нет /:lang в URL (голый MemoryRouter) → LocalizedLink использует DEFAULT_URL_LANG
    expect(screen.getByRole('link', { name: /Start searching/i })).toHaveAttribute('href', '/en/search');
    expect(screen.getByRole('link', { name: /Sign in/i })).toHaveAttribute('href', '/en/auth');
  });

  it('авторизованный пользователь не видит CTA Sign in', () => {
    authIsAuthenticated = true;
    renderPage();
    expect(screen.getByRole('link', { name: /Start searching/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Sign in/i })).toBeNull();
  });
});
