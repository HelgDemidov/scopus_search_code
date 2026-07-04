import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import NotFoundPage from './NotFoundPage';
import { getBlackHole } from '../../stores/blackHoleStore';

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

  it('registers a black hole position on mount and clears it on unmount', () => {
    const { unmount } = renderPage();
    expect(getBlackHole()).not.toBeNull();
    unmount();
    expect(getBlackHole()).toBeNull();
  });
});
