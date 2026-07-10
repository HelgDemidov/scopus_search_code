import { render, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { HelmetProvider, Helmet } from 'react-helmet-async';
import { describe, expect, it, vi } from 'vitest';
import { RootLayout } from './router';

// Header имеет тяжёлое дерево зависимостей (authStore/themeStore/stats и т.д.),
// не относящееся к тому, что здесь тестируется (fallback/override Helmet-тегов
// на уровне RootLayout, docs/i18n-url-routing/spec.md §6) — заглушка.
vi.mock('./components/layout/Header', () => ({ Header: () => null }));

// Дочерняя страница со своим Helmet — имитирует одну из 6 "wired" страниц
// (напр. AboutPage через useHreflangTags).
function ChildWithOwnHelmet() {
  return (
    <Helmet>
      <title>Child Title</title>
      <meta name="description" content="child description" />
      <link rel="canonical" href="https://example.com/child" />
    </Helmet>
  );
}

// Дочерняя страница без Helmet — имитирует "unwired" страницу (auth/profile/
// article/:id/error-страницы).
function ChildWithoutHelmet() {
  return <div>plain child</div>;
}

function renderAt(path: string, child: React.ReactNode) {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/" element={<RootLayout />}>
            <Route index element={child} />
          </Route>
        </Routes>
      </MemoryRouter>
    </HelmetProvider>,
  );
}

describe('RootLayout — дефолтный Helmet (fallback + override)', () => {
  it('unwired-страница (без своего Helmet) получает дефолтные title/description/canonical', async () => {
    renderAt('/', <ChildWithoutHelmet />);
    await waitFor(() => expect(document.title).toBe('Scopus Research Search'));
    expect(document.querySelector('meta[name="description"]')?.getAttribute('content')).toBe(
      'AI research publications from Scopus, curated and searchable',
    );
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
      'https://scopus-search-code.vercel.app/',
    );
  });

  it('wired-страница (со своим Helmet) переопределяет дефолт без дублей', async () => {
    renderAt('/', <ChildWithOwnHelmet />);
    await waitFor(() => expect(document.title).toBe('Child Title'));
    expect(document.querySelectorAll('meta[name="description"]').length).toBe(1);
    expect(document.querySelector('meta[name="description"]')?.getAttribute('content')).toBe(
      'child description',
    );
    expect(document.querySelectorAll('link[rel="canonical"]').length).toBe(1);
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
      'https://example.com/child',
    );
  });
});
