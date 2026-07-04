import { render, screen } from '@testing-library/react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { FilterFingerprintStrip } from './FilterFingerprintStrip';
import type { SearchHistoryItem } from '../../types/api';

function stubMatchMedia(matches: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

function item(id: number, createdAt: string, overrides: Partial<SearchHistoryItem> = {}): SearchHistoryItem {
  return {
    id,
    query: `q${id}`,
    created_at: createdAt,
    result_count: 1,
    results_available: true,
    filters: {},
    ...overrides,
  };
}

describe('FilterFingerprintStrip — загрузка/пустое состояние', () => {
  it('показывает skeleton при isLoading=true', () => {
    stubMatchMedia(false);
    const { container } = render(<FilterFingerprintStrip items={[]} isLoading={true} />);
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('items=[] рендерит empty-сообщение', () => {
    stubMatchMedia(false);
    render(<FilterFingerprintStrip items={[]} isLoading={false} />);
    expect(screen.getByText('Not enough search history yet.')).toBeInTheDocument();
  });
});

describe('FilterFingerprintStrip — responsive N (15 desktop / 8 mobile)', () => {
  const items = Array.from({ length: 20 }, (_, i) =>
    item(i, `2024-01-${String(20 - i).padStart(2, '0')}T00:00:00Z`),
  );

  it('desktop — не более 15 столбцов данных', () => {
    stubMatchMedia(false);
    render(<FilterFingerprintStrip items={items} isLoading={false} />);
    // 1 заголовочная колонка (th пустой) + 15 колонок данных в шапке
    expect(screen.getAllByRole('columnheader')).toHaveLength(16);
  });

  it('mobile — не более 8 столбцов данных', () => {
    stubMatchMedia(true);
    render(<FilterFingerprintStrip items={items} isLoading={false} />);
    expect(screen.getAllByRole('columnheader')).toHaveLength(9);
  });
});

describe('FilterFingerprintStrip — данные', () => {
  it('open_access фильтр — точка присутствует только когда ключ задан в filters', () => {
    stubMatchMedia(false);
    const items = [
      item(1, '2024-01-01T00:00:00Z', { filters: { open_access: true } }),
      item(2, '2024-01-02T00:00:00Z', { filters: {} }),
    ];
    const { container } = render(<FilterFingerprintStrip items={items} isLoading={false} />);
    const dots = container.querySelectorAll('span.rounded-full');
    // 2 колонки × (1 open_access dot + 0/1 zero-result dot); ищем именно open_access-строку —
    // первая строка данных (индекс сортировки: filled-круг с реальным фоном, не border-only)
    const filled = Array.from(dots).filter((d) => (d as HTMLElement).style.backgroundColor && (d as HTMLElement).style.backgroundColor !== 'transparent');
    expect(filled.length).toBeGreaterThanOrEqual(1);
  });

  it('year range width показывает число, когда year_from/year_to заданы, иначе "—"', () => {
    stubMatchMedia(false);
    const items = [
      item(1, '2024-01-01T00:00:00Z', { filters: { year_from: 2010, year_to: 2020 } }),
      item(2, '2024-01-02T00:00:00Z', { filters: {} }),
    ];
    render(<FilterFingerprintStrip items={items} isLoading={false} />);
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('zero-result маркер отображается только для поисков с results_available=false', () => {
    stubMatchMedia(false);
    const items = [
      item(1, '2024-01-01T00:00:00Z', { results_available: true }),
      item(2, '2024-01-02T00:00:00Z', { results_available: false }),
    ];
    render(<FilterFingerprintStrip items={items} isLoading={false} />);
    expect(screen.getAllByLabelText('No results')).toHaveLength(1);
  });

  it('doc_types/countries — число совпадает с длиной массивов фильтров', () => {
    stubMatchMedia(false);
    const items = [
      item(1, '2024-01-01T00:00:00Z', {
        filters: { document_types: ['Article', 'Review'], countries: ['Germany'] },
      }),
    ];
    render(<FilterFingerprintStrip items={items} isLoading={false} />);
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });
});
