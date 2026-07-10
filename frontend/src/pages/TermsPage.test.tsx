import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import TermsPage from './TermsPage';

describe('TermsPage', () => {
  it('рендерит заголовок и плейсхолдер-текст', () => {
    render(<TermsPage />);
    expect(screen.getByRole('heading', { name: 'Terms of Service', level: 1 })).toBeInTheDocument();
    expect(screen.getByText(/placeholder/i)).toBeInTheDocument();
  });
});
