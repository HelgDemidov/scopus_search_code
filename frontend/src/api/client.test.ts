import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AxiosAdapter } from 'axios';
import { toast } from 'sonner';
import { apiClient } from './client';

// sonner типизирует action как ReactNode | { label; onClick } — в этом коде
// (api/client.ts) это всегда объектная форма, приводим тип явно для теста
interface ClickAction { label: string; onClick: (e: unknown) => void }

// sonner — реальный toast трогать не нужно, проверяем только вызовы/аргументы
vi.mock('sonner', () => ({ toast: { warning: vi.fn(), error: vi.fn() } }));

Object.assign(navigator, { clipboard: { writeText: vi.fn() } });

// Мок на уровне транспорта axios (config.adapter) — официальный способ
// протестировать interceptor без реальной сети/сервера (issue #48 → request_id).
function respondWithError(status: number, headers: Record<string, string> = {}): AxiosAdapter {
  return (async (config) => {
    const error = Object.assign(new Error('mock http error'), {
      config,
      response: { status, headers, data: {}, statusText: '', config },
    });
    throw error;
  }) as AxiosAdapter;
}

function respondWithNetworkError(): AxiosAdapter {
  return (async (config) => {
    throw Object.assign(new Error('Network Error'), { config });
  }) as AxiosAdapter;
}

describe('apiClient response interceptor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a network-error toast when there is no response at all', async () => {
    apiClient.defaults.adapter = respondWithNetworkError();

    await expect(apiClient.get('/whatever')).rejects.toThrow();
    expect(toast.warning).toHaveBeenCalledTimes(1);
  });

  it('shows a 5xx toast including the request id and a working copy action', async () => {
    apiClient.defaults.adapter = respondWithError(500, { 'x-request-id': 'abc123' });

    await expect(apiClient.get('/whatever')).rejects.toThrow();
    expect(toast.error).toHaveBeenCalledTimes(1);

    const [message, opts] = vi.mocked(toast.error).mock.calls[0];
    expect(message).toContain('500');
    expect(opts?.description).toContain('abc123');

    (opts?.action as ClickAction | undefined)?.onClick(new MouseEvent('click'));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('abc123');
  });

  it('omits the copy action when no X-Request-ID header is present', async () => {
    apiClient.defaults.adapter = respondWithError(503);

    await expect(apiClient.get('/whatever')).rejects.toThrow();
    const [, opts] = vi.mocked(toast.error).mock.calls[0];
    expect(opts?.action).toBeUndefined();
    expect(opts?.description).toBeUndefined();
  });

  it('does not toast for 4xx — left to per-store handling', async () => {
    apiClient.defaults.adapter = respondWithError(404);

    await expect(apiClient.get('/whatever')).rejects.toThrow();
    expect(toast.error).not.toHaveBeenCalled();
    expect(toast.warning).not.toHaveBeenCalled();
  });
});
