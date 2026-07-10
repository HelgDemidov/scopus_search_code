import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import PrivacyPage from './PrivacyPage';

describe('PrivacyPage', () => {
  it('рендерит заголовок и плейсхолдер-текст', () => {
    render(<PrivacyPage />);
    expect(screen.getByRole('heading', { name: 'Privacy Policy', level: 1 })).toBeInTheDocument();
    expect(screen.getByText(/placeholder/i)).toBeInTheDocument();
  });
});
