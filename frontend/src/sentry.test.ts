import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as Sentry from '@sentry/react';
import { initSentry, stripQueryString } from './sentry';

vi.mock('@sentry/react', () => ({
  init: vi.fn(),
  browserTracingIntegration: vi.fn(() => 'mock-browser-tracing-integration'),
}));

describe('stripQueryString', () => {
  it('removes a single query param', () => {
    expect(stripQueryString('https://x.io/reset-password?token=secret')).toBe('https://x.io/reset-password');
  });

  it('removes multiple query params', () => {
    expect(stripQueryString('https://x.io/auth/google/callback?code=1&state=2')).toBe(
      'https://x.io/auth/google/callback',
    );
  });

  it('leaves a url without a query string unchanged', () => {
    expect(stripQueryString('https://x.io/health')).toBe('https://x.io/health');
  });

  it('returns undefined for undefined input', () => {
    expect(stripQueryString(undefined)).toBeUndefined();
  });
});

describe('initSentry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initializes Sentry with tracing, no default PII, and browser tracing integration', () => {
    initSentry();

    expect(Sentry.init).toHaveBeenCalledTimes(1);
    const [options] = vi.mocked(Sentry.init).mock.calls[0];
    expect(options.tracesSampleRate).toBe(1);
    expect(options.sendDefaultPii).toBe(false);
    expect(Sentry.browserTracingIntegration).toHaveBeenCalledTimes(1);
    expect(options.integrations).toEqual(['mock-browser-tracing-integration']);
  });

  it('beforeSend strips the query string from event.request.url', () => {
    initSentry();
    const [options] = vi.mocked(Sentry.init).mock.calls[0];

    const event = { request: { url: 'https://x.io/reset-password?token=secret' } };
    const result = options.beforeSend?.(event as never, {} as never);

    expect((result as typeof event)?.request?.url).toBe('https://x.io/reset-password');
  });

  it('beforeSendTransaction strips the query string from event.request.url', () => {
    initSentry();
    const [options] = vi.mocked(Sentry.init).mock.calls[0];

    const event = { request: { url: 'https://x.io/auth/google/callback?code=1&state=2' } };
    const result = options.beforeSendTransaction?.(event as never, {} as never);

    expect((result as typeof event)?.request?.url).toBe('https://x.io/auth/google/callback');
  });

  it('beforeBreadcrumb strips the query string from breadcrumb.data.url', () => {
    initSentry();
    const [options] = vi.mocked(Sentry.init).mock.calls[0];

    const breadcrumb = { data: { url: 'https://x.io/reset-password?token=secret' } };
    const result = options.beforeBreadcrumb?.(breadcrumb as never, undefined);

    expect((result as typeof breadcrumb)?.data?.url).toBe('https://x.io/reset-password');
  });
});
