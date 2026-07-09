import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import RouteErrorPage from './RouteErrorPage';

const mockUseRouteError = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useRouteError: () => mockUseRouteError(),
    isRouteErrorResponse: (err: unknown) =>
      typeof err === 'object' && err !== null && 'status' in err && 'statusText' in err,
  };
});

// ErrorPanel (§10.4 post-prod, docs/layout-overhaul/spec.md) вызывает
// useMediaQuery('(min-width: 640px)') безусловно — jsdom не реализует
// matchMedia, нужна заглушка перед любым рендером страницы.
beforeEach(() => {
  vi.stubGlobal('matchMedia', vi.fn().mockImplementation((q: string) => ({
    matches: false,
    media: q,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as MediaQueryList)));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderPage() {
  return render(
    <MemoryRouter>
      <RouteErrorPage />
    </MemoryRouter>,
  );
}

describe('RouteErrorPage', () => {
  it('shows the generic TRANSMISSION INTERRUPTED status for a plain JS error', () => {
    mockUseRouteError.mockReturnValue(new Error('boom'));
    renderPage();
    expect(screen.getByText('TRANSMISSION INTERRUPTED')).toBeInTheDocument();
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Go home' })).toBeInTheDocument();
  });

  it('shows a client-generated incident id next to the ID label', () => {
    mockUseRouteError.mockReturnValue(new Error('boom'));
    renderPage();
    expect(screen.getByText(/^ID:/)).toBeInTheDocument();
  });

  it('handles a route-response error (e.g. thrown Response) without crashing', () => {
    mockUseRouteError.mockReturnValue({ status: 500, statusText: 'Internal Server Error' });
    renderPage();
    expect(screen.getByText('TRANSMISSION INTERRUPTED')).toBeInTheDocument();
  });

  it('does not render the report button when VITE_SUPPORT_EMAIL is unset', () => {
    mockUseRouteError.mockReturnValue(new Error('boom'));
    renderPage();
    expect(screen.queryByRole('link', { name: 'Report this issue' })).not.toBeInTheDocument();
  });

  it('renders a mailto report link with the incident id when VITE_SUPPORT_EMAIL is set', () => {
    vi.stubEnv('VITE_SUPPORT_EMAIL', 'support@example.com');
    mockUseRouteError.mockReturnValue(new Error('boom'));
    renderPage();
    const link = screen.getByRole('link', { name: 'Report this issue' });
    expect(link.getAttribute('href')).toMatch(/^mailto:support@example\.com\?/);
    vi.unstubAllEnvs();
  });
});
