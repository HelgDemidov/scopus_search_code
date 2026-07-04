import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RootErrorBoundary } from './RootErrorBoundary';

function Bomb(): never {
  throw new Error('boom');
}

describe('RootErrorBoundary', () => {
  it('renders children normally when nothing throws', () => {
    render(
      <RootErrorBoundary>
        <p>all good</p>
      </RootErrorBoundary>,
    );
    expect(screen.getByText('all good')).toBeInTheDocument();
  });

  it('renders a self-contained fallback when a descendant throws', () => {
    // React логирует ошибку в консоль при componentDidCatch — подавляем шум теста
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <RootErrorBoundary>
        <Bomb />
      </RootErrorBoundary>,
    );
    expect(screen.getByText(/TRANSMISSION INTERRUPTED/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reload/i })).toBeInTheDocument();
    consoleSpy.mockRestore();
  });
});
