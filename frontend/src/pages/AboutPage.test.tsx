import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { describe, it, expect, vi } from 'vitest';
import AboutPage from './AboutPage';

// MemoryRouter — useHreflangTags читает :lang через useParams (требует Router-контекст).
// HelmetProvider — useHreflangTags рендерит <Helmet> (требует HelmetProvider-контекст).
function renderPage() {
  return render(
    <HelmetProvider>
      <MemoryRouter>
        <AboutPage />
      </MemoryRouter>
    </HelmetProvider>,
  );
}

describe('AboutPage', () => {
  it('рендерит заголовок и все секции контента', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: 'About this project', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Data source' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: "How it's built" })).toBeInTheDocument();
  });

  it('ссылка на исходный код ведёт на GitHub-репозиторий и открывается в новой вкладке', () => {
    renderPage();
    const link = screen.getByRole('link', { name: 'View source on GitHub' });
    expect(link).toHaveAttribute('href', 'https://github.com/HelgDemidov/scopus_search_code');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('не рендерит секцию "Контакты", если VITE_SUPPORT_EMAIL не задан', () => {
    vi.stubEnv('VITE_SUPPORT_EMAIL', '');
    renderPage();
    expect(screen.queryByRole('heading', { name: 'Contact' })).toBeNull();
    vi.unstubAllEnvs();
  });

  it('рендерит mailto-ссылку с адресом из VITE_SUPPORT_EMAIL, если задан', () => {
    vi.stubEnv('VITE_SUPPORT_EMAIL', 'support@example.com');
    renderPage();
    expect(screen.getByRole('heading', { name: 'Contact' })).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'support@example.com' });
    expect(link).toHaveAttribute('href', 'mailto:support@example.com');
    vi.unstubAllEnvs();
  });
});
