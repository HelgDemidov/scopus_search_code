import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PersonalKpiRow } from './PersonalKpiRow';
import { useDashboardStore } from '../../stores/dashboardStore';
import type { SearchStatsResponse } from '../../types/api';

const MOCK_STATS: SearchStatsResponse = {
  total: 42,
  by_year: [],
  by_journal: [
    { label: 'Nature', count: 3 },
    { label: 'IEEE Access', count: 2 },
  ],
  by_country: [
    { label: 'Germany', count: 5 },
    { label: 'USA', count: 3 },
  ],
  by_doc_type: [
    { label: 'Article', count: 30 },
    { label: 'Review', count: 12 },
  ],
  by_open_access: [
    { label: 'true', count: 18 },
    { label: 'false', count: 24 },
  ],
};

beforeEach(() => {
  useDashboardStore.setState({ activeSelection: null, drawerDimension: null, builderCards: [] });
});

describe('PersonalKpiRow', () => {
  it('рендерит 5 тайлов (без author)', () => {
    render(<PersonalKpiRow stats={MOCK_STATS} isLoading={false} />);
    expect(screen.getAllByRole('button')).toHaveLength(5);
    expect(screen.queryByText('Authors')).not.toBeInTheDocument();
  });

  it('отображает total в тайле Year (articlesFound)', () => {
    render(<PersonalKpiRow stats={MOCK_STATS} isLoading={false} />);
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('отображает кол-во уникальных стран (by_country.length)', () => {
    render(<PersonalKpiRow stats={MOCK_STATS} isLoading={false} />);
    expect(screen.getByText('Countries').closest('button')).toHaveTextContent('2');
  });

  it('отображает кол-во OA-статей из by_open_access (label="true")', () => {
    render(<PersonalKpiRow stats={MOCK_STATS} isLoading={false} />);
    expect(screen.getByText('Open Access').closest('button')).toHaveTextContent('18');
  });

  it('отображает кол-во типов документов (by_doc_type.length)', () => {
    render(<PersonalKpiRow stats={MOCK_STATS} isLoading={false} />);
    expect(screen.getByText('Document Types').closest('button')).toHaveTextContent('2');
  });

  it('отображает кол-во уникальных журналов (by_journal.length)', () => {
    render(<PersonalKpiRow stats={MOCK_STATS} isLoading={false} />);
    expect(screen.getByText('Journals').closest('button')).toHaveTextContent('2');
  });

  it('stats=null рендерит нули без падения', () => {
    render(<PersonalKpiRow stats={null} isLoading={false} />);
    expect(screen.getAllByRole('button')).toHaveLength(5);
  });

  it('показывает skeleton при isLoading=true', () => {
    const { container } = render(<PersonalKpiRow stats={null} isLoading={true} />);
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });

  it('клик по тайлу открывает drawer (openDrawer)', async () => {
    const openDrawer = vi.spyOn(useDashboardStore.getState(), 'openDrawer');
    render(<PersonalKpiRow stats={MOCK_STATS} isLoading={false} />);
    await userEvent.click(screen.getByText('Countries').closest('button')!);
    expect(openDrawer).toHaveBeenCalledWith('country');
  });

  it('повторный клик по активному тайлу закрывает drawer (toggle)', async () => {
    useDashboardStore.setState({ drawerDimension: 'journal' });
    const closeDrawer = vi.spyOn(useDashboardStore.getState(), 'closeDrawer');
    render(<PersonalKpiRow stats={MOCK_STATS} isLoading={false} />);
    await userEvent.click(screen.getByText('Journals').closest('button')!);
    expect(closeDrawer).toHaveBeenCalled();
  });

  it('тайл, соответствующий drawerDimension, имеет aria-pressed=true', () => {
    useDashboardStore.setState({ drawerDimension: 'doc_type' });
    render(<PersonalKpiRow stats={MOCK_STATS} isLoading={false} />);
    expect(screen.getByText('Document Types').closest('button')).toHaveAttribute('aria-pressed', 'true');
  });
});
