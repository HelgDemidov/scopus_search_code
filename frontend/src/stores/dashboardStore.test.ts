import { describe, it, expect, beforeEach } from 'vitest';
import { useDashboardStore } from './dashboardStore';

// Сброс стора между тестами (Zustand хранит состояние в модуле)
beforeEach(() => {
  useDashboardStore.setState({
    activeSelection: null,
    drawerDimension: null,
    builderCards: [],
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
    useDashboardStore.getState().addBuilderCard({ id: 'c1', dimension: 'year', chartType: 'bar_v' });
    expect(useDashboardStore.getState().builderCards).toHaveLength(1);
    expect(useDashboardStore.getState().builderCards[0]).toMatchObject({ id: 'c1', dimension: 'year' });
  });

  it('addBuilderCard сохраняет несколько карточек', () => {
    useDashboardStore.getState().addBuilderCard({ id: 'c1', dimension: 'year', chartType: 'line' });
    useDashboardStore.getState().addBuilderCard({ id: 'c2', dimension: 'country', chartType: 'pie' });
    expect(useDashboardStore.getState().builderCards).toHaveLength(2);
  });

  it('removeBuilderCard удаляет карточку по id', () => {
    useDashboardStore.setState({
      builderCards: [
        { id: 'c1', dimension: 'year', chartType: 'line' },
        { id: 'c2', dimension: 'country', chartType: 'bar_h' },
      ],
    });
    useDashboardStore.getState().removeBuilderCard('c1');
    const cards = useDashboardStore.getState().builderCards;
    expect(cards).toHaveLength(1);
    expect(cards[0].id).toBe('c2');
  });

  it('removeBuilderCard с несуществующим id не меняет массив', () => {
    useDashboardStore.setState({
      builderCards: [{ id: 'c1', dimension: 'year', chartType: 'line' }],
    });
    useDashboardStore.getState().removeBuilderCard('nonexistent');
    expect(useDashboardStore.getState().builderCards).toHaveLength(1);
  });
});
