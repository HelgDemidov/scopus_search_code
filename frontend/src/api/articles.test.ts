// Тесты для api/articles.ts — фокус на регрессиях filtering-2:
//   B5: year_from/year_to при значении 0 должны уходить в params (не игнорироваться как falsy)

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Мок HTTP-клиента — перехватываем вызовы, не ходим в сеть
// ---------------------------------------------------------------------------

vi.mock('./client', () => ({
  apiClient: {
    get: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Импорты после vi.mock
// ---------------------------------------------------------------------------

import { apiClient } from './client';
import { getArticles, findArticles } from './articles';

const mockedGet = vi.mocked(apiClient.get);

// ---------------------------------------------------------------------------
// Вспомогательная функция — извлекаем URLSearchParams из последнего вызова
// ---------------------------------------------------------------------------

function lastCallParams(): URLSearchParams {
  const calls = mockedGet.mock.calls;
  const lastCall = calls[calls.length - 1];
  return lastCall[1]?.params as URLSearchParams;
}

// ---------------------------------------------------------------------------
// beforeEach — базовый мок ответа и сброс
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  // Ответ покрывает getArticles (data.items) — при вызовах findArticles игнорируем return value
  mockedGet.mockResolvedValue({
    data: { items: [], total: 0 },
    headers: {},
  });
});

// ===========================================================================
// getArticles — year_from / year_to (B5 regression)
// ===========================================================================

describe('getArticles — year_from (B5 fix: if (x != null) вместо if (x))', () => {
  it('year_from=0 отправляется как "0" (ранее игнорировался как falsy)', async () => {
    await getArticles({ year_from: 0 });
    const p = lastCallParams();
    expect(p.has('year_from')).toBe(true);
    expect(p.get('year_from')).toBe('0');
  });

  it('year_from=undefined не попадает в params', async () => {
    await getArticles({ year_from: undefined });
    expect(lastCallParams().has('year_from')).toBe(false);
  });

  it('year_from=1990 отправляется корректно (happy path)', async () => {
    await getArticles({ year_from: 1990 });
    expect(lastCallParams().get('year_from')).toBe('1990');
  });
});

describe('getArticles — year_to (B5 fix)', () => {
  it('year_to=0 отправляется как "0"', async () => {
    await getArticles({ year_to: 0 });
    const p = lastCallParams();
    expect(p.has('year_to')).toBe(true);
    expect(p.get('year_to')).toBe('0');
  });

  it('year_to=undefined не попадает в params', async () => {
    await getArticles({ year_to: undefined });
    expect(lastCallParams().has('year_to')).toBe(false);
  });

  it('year_from=2020 и year_to=2024 — оба присутствуют', async () => {
    await getArticles({ year_from: 2020, year_to: 2024 });
    const p = lastCallParams();
    expect(p.get('year_from')).toBe('2020');
    expect(p.get('year_to')).toBe('2024');
  });
});

// ===========================================================================
// getArticles — прочие параметры (дым-тесты, убеждаемся что регрессии нет)
// ===========================================================================

describe('getArticles — прочие параметры', () => {
  it('open_access=true отправляется', async () => {
    await getArticles({ open_access: true });
    expect(lastCallParams().get('open_access')).toBe('true');
  });

  it('open_access=false отправляется (не игнорируется)', async () => {
    await getArticles({ open_access: false });
    expect(lastCallParams().get('open_access')).toBe('false');
  });

  it('open_access=undefined не попадает в params', async () => {
    await getArticles({ open_access: undefined });
    expect(lastCallParams().has('open_access')).toBe(false);
  });

  it('doc_types передаются как несколько append-значений', async () => {
    await getArticles({ doc_types: ['Article', 'Review'] });
    const p = lastCallParams();
    expect(p.getAll('doc_types')).toEqual(['Article', 'Review']);
  });

  it('countries передаются как несколько append-значений', async () => {
    await getArticles({ countries: ['Russia', 'USA'] });
    expect(lastCallParams().getAll('countries')).toEqual(['Russia', 'USA']);
  });

  it('page и size присутствуют по умолчанию', async () => {
    await getArticles({});
    const p = lastCallParams();
    expect(p.get('page')).toBe('1');
    expect(p.get('size')).toBe('10');
  });
});

// ===========================================================================
// findArticles — year_from / year_to (B5 regression)
// ===========================================================================

describe('findArticles — year_from (B5 fix)', () => {
  beforeEach(() => {
    // findArticles ожидает array в response.data
    mockedGet.mockResolvedValue({ data: [], headers: {} });
  });

  it('year_from=0 отправляется как "0"', async () => {
    await findArticles({ keyword: 'AI', year_from: 0 });
    const p = lastCallParams();
    expect(p.has('year_from')).toBe(true);
    expect(p.get('year_from')).toBe('0');
  });

  it('year_from=undefined не попадает в params', async () => {
    await findArticles({ keyword: 'AI', year_from: undefined });
    expect(lastCallParams().has('year_from')).toBe(false);
  });

  it('year_to=0 отправляется как "0"', async () => {
    await findArticles({ keyword: 'AI', year_to: 0 });
    expect(lastCallParams().get('year_to')).toBe('0');
  });

  it('year_to=undefined не попадает в params', async () => {
    await findArticles({ keyword: 'AI', year_to: undefined });
    expect(lastCallParams().has('year_to')).toBe(false);
  });

  it('keyword и count всегда присутствуют', async () => {
    await findArticles({ keyword: 'neural network' });
    const p = lastCallParams();
    expect(p.get('keyword')).toBe('neural network');
    expect(p.get('count')).toBe('25'); // дефолт
  });

  it('open_access=false отправляется (не игнорируется)', async () => {
    await findArticles({ keyword: 'AI', open_access: false });
    expect(lastCallParams().get('open_access')).toBe('false');
  });
});
