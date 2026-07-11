import { render, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { RootLayout } from './router';
import { recordBreadcrumb } from './utils/errorReport';

// Header имеет тяжёлое дерево зависимостей, не относящееся к тому, что
// здесь тестируется — заглушка (тот же паттерн, что router.rootLayoutSeo.test.tsx)
vi.mock('./components/layout/Header', () => ({ Header: () => null }));
vi.mock('./utils/errorReport', () => ({ recordBreadcrumb: vi.fn() }));

function renderAt(path: string) {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/" element={<RootLayout />}>
            <Route path="*" element={<div>page</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </HelmetProvider>,
  );
}

describe('RootLayout — query-string не должен утекать в breadcrumb/GA', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.gtag = vi.fn();
  });

  afterEach(() => {
    window.gtag = undefined;
  });

  it('recordBreadcrumb получает только pathname, без reset-password токена в query-string', async () => {
    renderAt('/reset-password?token=super-secret');
    await waitFor(() => expect(recordBreadcrumb).toHaveBeenCalledWith('/reset-password'));
  });

  it('window.gtag page_view получает только pathname, без query-string', async () => {
    renderAt('/reset-password?token=super-secret');
    await waitFor(() =>
      expect(window.gtag).toHaveBeenCalledWith('event', 'page_view', { page_path: '/reset-password' }),
    );
  });
});
