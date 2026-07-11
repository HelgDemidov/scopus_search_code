import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import * as Sentry from '@sentry/react';
import { ErrorBoundary } from './ErrorBoundary';

vi.mock('@sentry/react', () => ({ captureException: vi.fn() }));

function Bomb(): never {
  throw new Error('chart boom');
}

describe('ErrorBoundary', () => {
  it('renders children normally when nothing throws', () => {
    render(
      <ErrorBoundary>
        <p>all good</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText('all good')).toBeInTheDocument();
  });

  it('renders the default fallback when a descendant throws', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    );
    expect(screen.getByText(/Something went wrong/i)).toBeInTheDocument();
    consoleSpy.mockRestore();
  });

  it('reports the caught error to Sentry', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    );
    // React DEV re-invokes render once for error-boundary diagnostics
    // (prod build does not) — assert it fired, not an exact count
    expect(Sentry.captureException).toHaveBeenCalled();
    const [error] = vi.mocked(Sentry.captureException).mock.calls[0];
    expect((error as Error).message).toBe('chart boom');
    consoleSpy.mockRestore();
  });
});
