// Тесты для api/stats.ts — фокус на postNlPivotQuery (docs/ai-nl-pivot/spec.md §4)

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./client', () => ({
  apiClient: {
    post: vi.fn(),
  },
}));

import { apiClient } from './client';
import { postNlPivotQuery } from './stats';

const mockedPost = vi.mocked(apiClient.post);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('postNlPivotQuery', () => {
  it('отправляет query в теле POST-запроса на правильный путь', async () => {
    mockedPost.mockResolvedValue({
      data: { row_dim: 'year', col_dim: 'country', filter_dim: null, filter_value: null, metric: 'count' },
    });

    await postNlPivotQuery('articles per year and country');

    expect(mockedPost).toHaveBeenCalledWith(
      '/articles/stats/pivot/nl-query',
      { query: 'articles per year and country' },
      expect.objectContaining({ signal: undefined }),
    );
  });

  it('возвращает данные ответа как есть', async () => {
    const responseData = {
      row_dim: 'doc_type',
      col_dim: 'open_access',
      filter_dim: null,
      filter_value: null,
      metric: 'avg_citations',
    };
    mockedPost.mockResolvedValue({ data: responseData });

    const result = await postNlPivotQuery('average citations by doc type and OA');

    expect(result).toEqual(responseData);
  });

  it('пробрасывает AbortSignal в конфиг запроса', async () => {
    mockedPost.mockResolvedValue({
      data: { row_dim: 'year', col_dim: 'country', filter_dim: null, filter_value: null, metric: 'count' },
    });
    const controller = new AbortController();

    await postNlPivotQuery('anything', controller.signal);

    expect(mockedPost).toHaveBeenCalledWith(
      '/articles/stats/pivot/nl-query',
      { query: 'anything' },
      expect.objectContaining({ signal: controller.signal }),
    );
  });
});
