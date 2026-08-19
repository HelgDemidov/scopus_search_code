import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useStatsStore } from './statsStore';
import type { StatsResponse, KpiTotalsResponse } from '../types/api';

// Мокируем API-слой — тест стора не должен делать HTTP-запросы
vi.mock('../api/stats', () => ({
  getStats: vi.fn(),
  getKpiTotals: vi.fn(),
}));

import { getStats, getKpiTotals } from '../api/stats';

const mockStats: StatsResponse = {
  total_articles: 42,
  total_journals: 10,
  total_countries: 5,
  total_authors: 8,
  open_access_count: 7,
  by_year: [],
  by_journal: [],
  by_country: [],
  by_doc_type: [],
  top_authors: [],
  by_year_top_countries: [],
  sunburst_country_open_access: [],
  top_journals_by_country: [],
  country_impact: [],
};

const mockKpiTotals: KpiTotalsResponse = {
  total_articles: 42,
  total_journals: 10,
  total_countries: 5,
  total_authors: 8,
  open_access_count: 7,
  total_doc_types: 3,
};

beforeEach(() => {
  vi.clearAllMocks();
  useStatsStore.setState({
    stats: null,
    isLoading: false,
    error: null,
    kpiTotals: null,
    isKpiLoading: false,
    kpiError: null,
  });
});

describe('fetchStats — гонка App.tsx + ExplorePage (оба монтируются на /explore)', () => {
  it('не дублирует GET /articles/stats при двух почти одновременных вызовах', async () => {
    // App.tsx монтируется, вызывает fetchStats(); ExplorePage монтируется следом,
    // до того как первый запрос успел разрешиться (та же гонка, что уже была
    // найдена и починена для fetchKpiTotals — см. комментарий в statsStore.ts).
    vi.mocked(getStats).mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve(mockStats), 10)));

    const { fetchStats } = useStatsStore.getState();
    await Promise.all([fetchStats(), fetchStats()]);

    expect(getStats).toHaveBeenCalledTimes(1);
    expect(useStatsStore.getState().stats).toEqual(mockStats);
  });

  it('не дублирует GET /articles/stats/summary при двух почти одновременных вызовах (регрессия — уже была починена)', async () => {
    vi.mocked(getKpiTotals).mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(mockKpiTotals), 10))
    );

    const { fetchKpiTotals } = useStatsStore.getState();
    await Promise.all([fetchKpiTotals(), fetchKpiTotals()]);

    expect(getKpiTotals).toHaveBeenCalledTimes(1);
  });
});
