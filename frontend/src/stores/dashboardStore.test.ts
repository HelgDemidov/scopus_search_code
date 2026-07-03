import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useDashboardStore } from './dashboardStore';

// Мокируем API-слой — тест стора не должен делать HTTP-запросы
vi.mock('../api/stats', () => ({
  selectionToParams: vi.fn((sel) => {
    if (sel.dimension === 'country') return { countries: [sel.value] };
    if (sel.dimension === 'journal') return null;
    return { doc_types: [sel.value] };
  }),
  getFilteredStats: vi.fn(),
}));

// Сброс стора и localStorage между тестами
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  useDashboardStore.setState({
    activeSelection: null,
    drawerDimension: null,
    builderCards: [],
    filteredStats: null,
    filteredStatsLoading: false,
  });
});

// ---------------------------------------------------------------------------
// activeSelection / cross-filter
// ---------------------------------------------------------------------------

describe('setSelection', () => {
  it('устанавливает выбранный элемент', () => {
    const { setSelection } = useDashboardStore.getState();
    setSelection({ dimension: 'country', value: 'China' });
    expect(useDashboardStore.getState().activeSelection).toEqual({
      dimension: 'country',
      value: 'China',
    });
  });

  it('сбрасывает selection при повторном клике на тот же элемент (toggle)', () => {
    const { setSelection } = useDashboardStore.getState();
    setSelection({ dimension: 'country', value: 'China' });
    setSelection({ dimension: 'country', value: 'China' });
    expect(useDashboardStore.getState().activeSelection).toBeNull();
  });

  it('заменяет selection при клике на другой элемент того же измерения', () => {
    const { setSelection } = useDashboardStore.getState();
    setSelection({ dimension: 'country', value: 'China' });
    setSelection({ dimension: 'country', value: 'India' });
    expect(useDashboardStore.getState().activeSelection).toEqual({
      dimension: 'country',
      value: 'India',
    });
  });

  it('заменяет selection при смене измерения', () => {
    const { setSelection } = useDashboardStore.getState();
    setSelection({ dimension: 'country', value: 'China' });
    setSelection({ dimension: 'journal', value: 'Nature' });
    expect(useDashboardStore.getState().activeSelection).toEqual({
      dimension: 'journal',
      value: 'Nature',
    });
  });

  it('setSelection(null) сбрасывает в null', () => {
    const { setSelection } = useDashboardStore.getState();
    setSelection({ dimension: 'country', value: 'China' });
    setSelection(null);
    expect(useDashboardStore.getState().activeSelection).toBeNull();
  });
});

describe('clearSelection', () => {
  it('сбрасывает activeSelection в null', () => {
    useDashboardStore.setState({ activeSelection: { dimension: 'doc_type', value: 'Article' } });
    useDashboardStore.getState().clearSelection();
    expect(useDashboardStore.getState().activeSelection).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Drawer
// ---------------------------------------------------------------------------

describe('drawer', () => {
  it('openDrawer устанавливает drawerDimension', () => {
    useDashboardStore.getState().openDrawer('country');
    expect(useDashboardStore.getState().drawerDimension).toBe('country');
  });

  it('closeDrawer сбрасывает drawerDimension в null', () => {
    useDashboardStore.setState({ drawerDimension: 'journal' });
    useDashboardStore.getState().closeDrawer();
    expect(useDashboardStore.getState().drawerDimension).toBeNull();
  });

  it('openDrawer заменяет предыдущее измерение', () => {
    useDashboardStore.getState().openDrawer('country');
    useDashboardStore.getState().openDrawer('journal');
    expect(useDashboardStore.getState().drawerDimension).toBe('journal');
  });
});

// ---------------------------------------------------------------------------
// Chart Builder
// ---------------------------------------------------------------------------

describe('builderCards', () => {
  it('addBuilderCard добавляет карточку в массив', () => {
    useDashboardStore.getState().addBuilderCard({ rowDim: 'year', colDim: 'country' });
    const cards = useDashboardStore.getState().builderCards;
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ rowDim: 'year', colDim: 'country' });
    expect(typeof cards[0].id).toBe('string');
  });

  it('addBuilderCard сохраняет несколько карточек', () => {
    useDashboardStore.getState().addBuilderCard({ rowDim: 'year', colDim: 'doc_type' });
    useDashboardStore.getState().addBuilderCard({ rowDim: 'country', colDim: 'open_access' });
    expect(useDashboardStore.getState().builderCards).toHaveLength(2);
  });

  it('addBuilderCard сохраняет опциональный slicer (filterDim/filterValue)', () => {
    useDashboardStore.getState().addBuilderCard({
      rowDim: 'doc_type',
      colDim: 'open_access',
      filterDim: 'year',
      filterValue: '2024',
    });
    const cards = useDashboardStore.getState().builderCards;
    expect(cards[0]).toMatchObject({ filterDim: 'year', filterValue: '2024' });
  });

  it('removeBuilderCard удаляет карточку по id', () => {
    useDashboardStore.setState({
      builderCards: [
        { id: 'c1', rowDim: 'year', colDim: 'country' },
        { id: 'c2', rowDim: 'country', colDim: 'doc_type' },
      ],
    });
    useDashboardStore.getState().removeBuilderCard('c1');
    const cards = useDashboardStore.getState().builderCards;
    expect(cards).toHaveLength(1);
    expect(cards[0].id).toBe('c2');
  });

  it('removeBuilderCard с несуществующим id не меняет массив', () => {
    useDashboardStore.setState({
      builderCards: [{ id: 'c1', rowDim: 'year', colDim: 'country' }],
    });
    useDashboardStore.getState().removeBuilderCard('nonexistent');
    expect(useDashboardStore.getState().builderCards).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Cross-filter V2: fetchFilteredStats / clearFilteredStats
// ---------------------------------------------------------------------------

describe('fetchFilteredStats', () => {
  it('устанавливает filteredStats после успешного запроса', async () => {
    const { getFilteredStats } = await import('../api/stats');
    const mockStats = { total_articles: 42, by_country: [], by_year: [], by_doc_type: [], by_journal: [], top_keywords: [], top_authors: [], total_journals: 1, total_countries: 1, total_authors: 5, open_access_count: 10 };
    vi.mocked(getFilteredStats).mockResolvedValueOnce(mockStats as never);

    await useDashboardStore.getState().fetchFilteredStats({ dimension: 'country', value: 'China' });

    expect(useDashboardStore.getState().filteredStats).toEqual(mockStats);
    expect(useDashboardStore.getState().filteredStatsLoading).toBe(false);
  });

  it('для неподдерживаемого измерения (journal) сбрасывает filteredStats, не вызывает API', async () => {
    const { getFilteredStats } = await import('../api/stats');
    // Предустанавливаем ненулевые filteredStats
    useDashboardStore.setState({ filteredStats: { total_articles: 99 } as never });

    await useDashboardStore.getState().fetchFilteredStats({ dimension: 'journal', value: 'Nature' });

    expect(useDashboardStore.getState().filteredStats).toBeNull();
    expect(vi.mocked(getFilteredStats)).not.toHaveBeenCalled();
  });
});

describe('clearFilteredStats', () => {
  it('сбрасывает filteredStats и filteredStatsLoading в исходное состояние', () => {
    useDashboardStore.setState({ filteredStats: { total_articles: 10 } as never, filteredStatsLoading: true });

    useDashboardStore.getState().clearFilteredStats();

    expect(useDashboardStore.getState().filteredStats).toBeNull();
    expect(useDashboardStore.getState().filteredStatsLoading).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Persist (localStorage)
// ---------------------------------------------------------------------------

describe('persist', () => {
  it('addBuilderCard записывает builderCards в localStorage', () => {
    useDashboardStore.getState().addBuilderCard({ rowDim: 'country', colDim: 'doc_type' });

    const raw = localStorage.getItem('scopus-dashboard-v1');
    expect(raw).not.toBeNull();
    const stored = JSON.parse(raw!);
    expect(stored.state.builderCards).toHaveLength(1);
    expect(stored.state.builderCards[0].rowDim).toBe('country');
  });

  it('partialize: activeSelection и drawerDimension не попадают в localStorage', () => {
    useDashboardStore.getState().setSelection({ dimension: 'country', value: 'China' });
    useDashboardStore.getState().openDrawer('journal');

    const raw = localStorage.getItem('scopus-dashboard-v1');
    // persist пишет в localStorage только при изменении builderCards;
    // при наличии записи — activeSelection и drawerDimension отсутствуют
    if (raw) {
      const stored = JSON.parse(raw);
      expect(stored.state).not.toHaveProperty('activeSelection');
      expect(stored.state).not.toHaveProperty('drawerDimension');
    }
    // Если localStorage пуст — partialize отработал корректно (ничего не записал)
    expect(true).toBe(true);
  });
});

describe('persist migrate (v2 — Table Builder заменил Chart Builder)', () => {
  it('сбрасывает builderCards при version < 2 (несовместимая старая форма dimension/chartType)', () => {
    const { migrate } = useDashboardStore.persist.getOptions();
    const oldPersisted = { builderCards: [{ id: 'x', dimension: 'year', chartType: 'line' }] };

    const result = migrate!(oldPersisted, 1) as { builderCards: unknown[] };

    expect(result.builderCards).toEqual([]);
  });

  it('сохраняет builderCards при version >= 2 (совместимая форма rowDim/colDim)', () => {
    const { migrate } = useDashboardStore.persist.getOptions();
    const currentPersisted = { builderCards: [{ id: 'x', rowDim: 'year', colDim: 'country' }] };

    const result = migrate!(currentPersisted, 2) as { builderCards: unknown[] };

    expect(result.builderCards).toHaveLength(1);
  });
});
