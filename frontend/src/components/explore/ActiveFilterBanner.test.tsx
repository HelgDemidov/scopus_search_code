import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ActiveFilterBanner } from './ActiveFilterBanner';
import { useDashboardStore } from '../../stores/dashboardStore';
import { useStatsStore } from '../../stores/statsStore';

// Мокируем statsStore — баннеру нужен только total_articles
vi.mock('../../stores/statsStore', () => ({
  useStatsStore: vi.fn(),
}));

const GLOBAL_STATS_MOCK = { total_articles: 1000 };

beforeEach(() => {
  localStorage.clear();
  // useStatsStore используется с селектором: useStatsStore((s) => s.stats)
// Mock игнорирует селектор и сразу возвращает stats-объект
vi.mocked(useStatsStore).mockReturnValue(GLOBAL_STATS_MOCK as never);
  useDashboardStore.setState({
    activeSelection: null,
    filteredStats: null,
    filteredStatsLoading: false,
    clearSelection: vi.fn(),
    clearFilteredStats: vi.fn(),
  } as never);
});

describe('ActiveFilterBanner', () => {
  it('не рендерится без activeSelection', () => {
    const { container } = render(<ActiveFilterBanner />);
    expect(container.firstChild).toBeNull();
  });

  it('показывает измерение и значение при activeSelection', () => {
    useDashboardStore.setState({
      activeSelection: { dimension: 'country', value: 'China' },
    } as never);

    render(<ActiveFilterBanner />);

    expect(screen.getByText('Country')).toBeInTheDocument();
    expect(screen.getByText('China')).toBeInTheDocument();
  });

  it('показывает "X of Y articles" когда filteredStats загружены', () => {
    useDashboardStore.setState({
      activeSelection: { dimension: 'country', value: 'China' },
      filteredStats: { total_articles: 250 },
    } as never);

    render(<ActiveFilterBanner />);

    expect(screen.getByText(/250/)).toBeInTheDocument();
    expect(screen.getByText(/1,000/)).toBeInTheDocument();
  });

  it('кнопка Clear вызывает clearSelection и clearFilteredStats', async () => {
    const clearSelection = vi.fn();
    const clearFilteredStats = vi.fn();

    useDashboardStore.setState({
      activeSelection: { dimension: 'doc_type', value: 'Review' },
      clearSelection,
      clearFilteredStats,
    } as never);

    render(<ActiveFilterBanner />);

    await userEvent.click(screen.getByRole('button', { name: /clear filter/i }));

    expect(clearSelection).toHaveBeenCalledOnce();
    expect(clearFilteredStats).toHaveBeenCalledOnce();
  });
});
