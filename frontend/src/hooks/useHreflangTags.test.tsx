import { render, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { describe, expect, it } from 'vitest';
import { useHreflangTags } from './useHreflangTags';

function TestHost({ path }: { path: string }) {
  return <>{useHreflangTags(path)}</>;
}

// Голый MemoryRouter (без :lang в URL) — useParams() возвращает {}, тот же
// фоллбэк-путь, что LocalizedLink/useLocalizedPath используют вне /:lang-поддерева.
function renderBare(path: string) {
  return render(
    <HelmetProvider>
      <MemoryRouter>
        <TestHost path={path} />
      </MemoryRouter>
    </HelmetProvider>,
  );
}

// С реальным :lang в URL, через настоящий матчинг маршрута
function renderWithLang(urlPath: string, canonicalPath: string) {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[urlPath]}>
        <Routes>
          <Route path=":lang/*" element={<TestHost path={canonicalPath} />} />
        </Routes>
      </MemoryRouter>
    </HelmetProvider>,
  );
}

describe('useHreflangTags', () => {
  it('рендерит title/description для зарегистрированной секции манифеста', async () => {
    renderBare('/about');
    await waitFor(() => expect(document.title).toBe('About | Scopus Search'));
    expect(document.querySelector('meta[name="description"]')?.getAttribute('content')).toBe(
      'What Scopus Search is, where the data comes from, and how the project is built.',
    );
  });

  it('canonical и hreflang используют DEFAULT_URL_LANG вне /:lang-поддерева', async () => {
    renderBare('/about');
    await waitFor(() =>
      expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
        'https://scopus-search-code.vercel.app/en/about',
      ),
    );
  });

  it('canonical следует за фактическим :lang из URL', async () => {
    renderWithLang('/ru/about', '/about');
    await waitFor(() =>
      expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
        'https://scopus-search-code.vercel.app/ru/about',
      ),
    );
  });

  it('рендерит ровно 3 alternate-тега (en/ru/sr-Latn) + 1 x-default', async () => {
    renderBare('/about');
    await waitFor(() => expect(document.querySelectorAll('link[rel="alternate"]').length).toBe(4));
    const hreflangs = Array.from(document.querySelectorAll('link[rel="alternate"]')).map((el) =>
      el.getAttribute('hreflang'),
    );
    expect(hreflangs).toEqual(expect.arrayContaining(['en', 'ru', 'sr-Latn', 'x-default']));
  });

  it('x-default указывает на en-вариант', async () => {
    renderWithLang('/sr-latn/about', '/about');
    await waitFor(() => {
      const xDefault = document.querySelector('link[hreflang="x-default"]');
      expect(xDefault?.getAttribute('href')).toBe('https://scopus-search-code.vercel.app/en/about');
    });
  });

  it('alternate sr-latn URL-сегмент (lowercase) сопоставлен с каноническим hreflang sr-Latn', async () => {
    renderBare('/about');
    await waitFor(() => {
      const srAlt = document.querySelector('link[hreflang="sr-Latn"]');
      expect(srAlt?.getAttribute('href')).toBe('https://scopus-search-code.vercel.app/sr-latn/about');
    });
  });

  it('не рендерит title/description для пути вне манифеста, но canonical/hreflang остаются', async () => {
    renderBare('/profile');
    await waitFor(() =>
      expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
        'https://scopus-search-code.vercel.app/en/profile',
      ),
    );
    expect(document.querySelector('meta[name="description"]')).toBeNull();
  });
});
