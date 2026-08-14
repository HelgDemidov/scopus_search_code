import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { KpiRow } from './KpiRow';
import { useStatsStore } from '../../stores/statsStore';
import { useDashboardStore } from '../../stores/dashboardStore';
import type { KpiTotalsResponse } from '../../types/api';

// ---------------------------------------------------------------------------
// Заглушка statsStore — KpiRow читает kpiTotals/isKpiLoading (GET
// /articles/stats/summary), не полный stats/isLoading (быстрый фикс
// 2026-08-14, docs/backend-performance/explore-kpi-summary/spec.md): плитки
// не должны ждать 9 остальных тяжёлых агрегатов get_stats(), нужных только
// DimensionDrawer/графикам ниже KPI-ряда.
// ---------------------------------------------------------------------------
const MOCK_KPI_TOTALS: KpiTotalsResponse = {
  total_articles: 39800,
  total_journals: 22,
  total_countries: 146,
  total_authors: 8541,
  open_access_count: 43213,
  total_doc_types: 2,
};

beforeEach(() => {
  useStatsStore.setState({ kpiTotals: MOCK_KPI_TOTALS, isKpiLoading: false, kpiError: null });
  useDashboardStore.setState({ activeSelection: null, drawerDimension: null, builderCards: [] });
});

describe('KpiRow', () => {
  it('рендерит 6 тайлов', () => {
    render(<KpiRow />);
    expect(screen.getAllByRole('button')).toHaveLength(6);
  });

  it('отображает total_articles в тайле Year', () => {
    render(<KpiRow />);
    expect(screen.getByText('39,800')).toBeInTheDocument();
  });

  it('отображает total_countries', () => {
    render(<KpiRow />);
    expect(screen.getByText('146')).toBeInTheDocument();
  });

  it('отображает open_access_count', () => {
    render(<KpiRow />);
    expect(screen.getByText('43,213')).toBeInTheDocument();
  });

  it('отображает total_journals', () => {
    render(<KpiRow />);
    expect(screen.getByText('22')).toBeInTheDocument();
  });

  it('отображает total_authors в тайле Authors', () => {
    render(<KpiRow />);
    expect(screen.getByText('8,541')).toBeInTheDocument();
  });

  it('ни один тайл не активен при drawerDimension=null', () => {
    render(<KpiRow />);
    const buttons = screen.getAllByRole('button');
    buttons.forEach((btn) => {
      expect(btn).toHaveAttribute('aria-pressed', 'false');
    });
  });

  it('клик по тайлу открывает drawer (openDrawer)', async () => {
    render(<KpiRow />);
    // «Countries» — второй тайл (dimension=country)
    await userEvent.click(screen.getByText('Countries').closest('button')!);
    expect(useDashboardStore.getState().drawerDimension).toBe('country');
  });

  it('повторный клик по активному тайлу закрывает drawer (toggle)', async () => {
    useDashboardStore.setState({ drawerDimension: 'country' });
    render(<KpiRow />);
    await userEvent.click(screen.getByText('Countries').closest('button')!);
    expect(useDashboardStore.getState().drawerDimension).toBeNull();
  });

  it('тайл, соответствующий drawerDimension, имеет aria-pressed=true', () => {
    useDashboardStore.setState({ drawerDimension: 'journal' });
    render(<KpiRow />);
    const journalsButton = screen.getByText('Journals').closest('button');
    expect(journalsButton).toHaveAttribute('aria-pressed', 'true');
  });

  it('показывает skeleton при isKpiLoading=true', () => {
    useStatsStore.setState({ kpiTotals: null, isKpiLoading: true, kpiError: null });
    const { container } = render(<KpiRow />);
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Spy на openDrawer/closeDrawer (убеждаемся что вызываются именно они)
// ---------------------------------------------------------------------------

describe('KpiRow — store side-effects', () => {
  it('клик вызывает openDrawer через useDashboardStore', async () => {
    const openDrawer = vi.spyOn(useDashboardStore.getState(), 'openDrawer');
    render(<KpiRow />);
    await userEvent.click(screen.getByText('Open Access').closest('button')!);
    expect(openDrawer).toHaveBeenCalledWith('open_access');
  });

  it('клик по активному drawer вызывает closeDrawer', async () => {
    useDashboardStore.setState({ drawerDimension: 'open_access' });
    const closeDrawer = vi.spyOn(useDashboardStore.getState(), 'closeDrawer');
    render(<KpiRow />);
    await userEvent.click(screen.getByText('Open Access').closest('button')!);
    expect(closeDrawer).toHaveBeenCalled();
  });
});
