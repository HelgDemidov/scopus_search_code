import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildReportMailto, getBreadcrumbs, recordBreadcrumb } from './errorReport';

describe('recordBreadcrumb / getBreadcrumbs', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('records entries and returns them in insertion order', () => {
    recordBreadcrumb('/a');
    recordBreadcrumb('/b');
    const entries = getBreadcrumbs();
    expect(entries.map((e) => e.path)).toEqual(['/a', '/b']);
  });

  it('caps the ring buffer at the last 10 entries', () => {
    for (let i = 0; i < 15; i++) recordBreadcrumb(`/page-${i}`);
    const entries = getBreadcrumbs();
    expect(entries).toHaveLength(10);
    expect(entries[0].path).toBe('/page-5');
    expect(entries[entries.length - 1].path).toBe('/page-14');
  });

  it('degrades gracefully if sessionStorage throws (private mode etc.)', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });
    expect(() => recordBreadcrumb('/x')).not.toThrow();
    spy.mockRestore();
  });
});

describe('buildReportMailto', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.unstubAllEnvs();
  });

  it('returns null when VITE_SUPPORT_EMAIL is not configured', () => {
    expect(buildReportMailto({ requestId: 'abc' })).toBeNull();
  });

  it('builds a mailto link with requestId, URL and timestamp when configured', () => {
    vi.stubEnv('VITE_SUPPORT_EMAIL', 'support@example.com');
    const href = buildReportMailto({ requestId: 'abc123', message: 'boom' });
    expect(href).toMatch(/^mailto:support@example\.com\?subject=/);
    const decoded = decodeURIComponent(href ?? '');
    expect(decoded).toContain('Request ID: abc123');
    expect(decoded).toContain('Error: boom');
    expect(decoded).toContain('URL: ');
  });

  it('includes recorded breadcrumbs in the mailto body', () => {
    vi.stubEnv('VITE_SUPPORT_EMAIL', 'support@example.com');
    recordBreadcrumb('/explore');
    const href = buildReportMailto({});
    const decoded = decodeURIComponent(href ?? '');
    expect(decoded).toContain('/explore');
  });
});
