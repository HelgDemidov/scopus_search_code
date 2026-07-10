import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { describe, it, expect } from 'vitest';
import PrivacyPage from './PrivacyPage';

describe('PrivacyPage', () => {
  it('рендерит заголовок и плейсхолдер-текст', () => {
    render(
      <HelmetProvider>
        <MemoryRouter>
          <PrivacyPage />
        </MemoryRouter>
      </HelmetProvider>,
    );
    expect(screen.getByRole('heading', { name: 'Privacy Policy', level: 1 })).toBeInTheDocument();
    expect(screen.getByText(/placeholder/i)).toBeInTheDocument();
  });
});
