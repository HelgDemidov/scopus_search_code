import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { RootRedirect, LangIndexRedirect, LegacyPathRedirect } from './router';
import i18n from './i18n';

// Наблюдатель конечного URL после Navigate — рендерится на catch-all роуте,
// куда должен приземлиться редирект.
function LocationProbe() {
  const location = useLocation();
  return <div data-testid="probe">{location.pathname + location.search}</div>;
}

let authIsAuthenticated = false;
vi.mock('./stores/authStore', () => ({
  useAuthStore: (selector: (s: { isAuthenticated: boolean }) => unknown) =>
    selector({ isAuthenticated: authIsAuthenticated }),
}));

beforeEach(() => {
  authIsAuthenticated = false;
});

afterEach(async () => {
  await i18n.changeLanguage('en');
});

describe('RootRedirect (голый /)', () => {
  it('анонимный визитёр → /{detectedLang}/main', async () => {
    await i18n.changeLanguage('ru');
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route index element={<RootRedirect />} />
          <Route path="*" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByTestId('probe')).toHaveTextContent('/ru/main');
  });

  it('авторизованный визитёр → /{detectedLang}/search', async () => {
    authIsAuthenticated = true;
    await i18n.changeLanguage('sr-Latn');
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route index element={<RootRedirect />} />
          <Route path="*" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByTestId('probe')).toHaveTextContent('/sr-latn/search');
  });
});

describe('LangIndexRedirect (голый /:lang)', () => {
  it('сохраняет текущий :lang из URL при редиректе на роль-based цель', async () => {
    render(
      <MemoryRouter initialEntries={['/ru']}>
        <Routes>
          <Route path=":lang" element={<LangIndexRedirect />} />
          <Route path="*" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByTestId('probe')).toHaveTextContent('/ru/main');
  });
});

describe('LegacyPathRedirect (bare-пути до этого ТЗ)', () => {
  it('добавляет DEFAULT_URL_LANG-префикс, сохраняя путь и query-строку', async () => {
    render(
      <MemoryRouter initialEntries={['/explore?mode=personal']}>
        <Routes>
          <Route path="explore" element={<LegacyPathRedirect />} />
          <Route path="*" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByTestId('probe')).toHaveTextContent('/en/explore?mode=personal');
  });

  it('сохраняет динамический сегмент (:id) без изменений', async () => {
    render(
      <MemoryRouter initialEntries={['/article/123']}>
        <Routes>
          <Route path="article/:id" element={<LegacyPathRedirect />} />
          <Route path="*" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByTestId('probe')).toHaveTextContent('/en/article/123');
  });
});
