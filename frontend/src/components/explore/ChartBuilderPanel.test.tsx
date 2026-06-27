import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChartBuilderPanel } from './ChartBuilderPanel';
import { useDashboardStore } from '../../stores/dashboardStore';

// ---------------------------------------------------------------------------
// Сбрасываем стор перед каждым тестом
// ---------------------------------------------------------------------------

beforeEach(() => {
  useDashboardStore.setState({ builderCards: [] });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ChartBuilderPanel', () => {
  it('изначально показывает кнопку "Add chart" и не показывает панель', () => {
    render(<ChartBuilderPanel />);
    expect(screen.getByRole('button', { name: /add chart/i })).toBeTruthy();
    expect(screen.queryByRole('region', { name: /chart builder/i })).toBeNull();
  });

  it('раскрывает панель при клике на кнопку "Add chart"', () => {
    render(<ChartBuilderPanel />);
    fireEvent.click(screen.getByRole('button', { name: /add chart/i }));
    expect(screen.getByRole('region', { name: /chart builder/i })).toBeTruthy();
  });

  it('показывает 6 вариантов измерений', () => {
    render(<ChartBuilderPanel />);
    fireEvent.click(screen.getByRole('button', { name: /add chart/i }));
    const labels = ['Publications by Year', 'Countries', 'Document Types', 'Top Journals', 'Open Access', 'Thematic Areas'];
    for (const label of labels) {
      expect(screen.getByRole('button', { name: new RegExp(label, 'i') })).toBeTruthy();
    }
  });

  it('по умолчанию выбрана dimension "Countries" (aria-pressed=true)', () => {
    render(<ChartBuilderPanel />);
    fireEvent.click(screen.getByRole('button', { name: /add chart/i }));
    const countriesBtn = screen.getByRole('button', { name: /^countries$/i });
    expect(countriesBtn.getAttribute('aria-pressed')).toBe('true');
  });

  it('смена измерения обновляет aria-pressed', () => {
    render(<ChartBuilderPanel />);
    fireEvent.click(screen.getByRole('button', { name: /add chart/i }));
    fireEvent.click(screen.getByRole('button', { name: /^top journals$/i }));
    expect(screen.getByRole('button', { name: /^top journals$/i }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: /^countries$/i }).getAttribute('aria-pressed')).toBe('false');
  });

  it('при смене измерения авто-выбирается первый допустимый тип чарта', () => {
    render(<ChartBuilderPanel />);
    fireEvent.click(screen.getByRole('button', { name: /add chart/i }));
    // Countries → bar_h (первый по умолчанию)
    expect(screen.getByRole('button', { name: /^horizontal bar$/i }).getAttribute('aria-pressed')).toBe('true');
    // Переключаемся на Year → первый допустимый = line
    fireEvent.click(screen.getByRole('button', { name: /^publications by year$/i }));
    expect(screen.getByRole('button', { name: /^line$/i }).getAttribute('aria-pressed')).toBe('true');
  });

  it('для year показывает только line/bar_v/table, не показывает bar_h или pie', () => {
    render(<ChartBuilderPanel />);
    fireEvent.click(screen.getByRole('button', { name: /add chart/i }));
    fireEvent.click(screen.getByRole('button', { name: /^publications by year$/i }));
    expect(screen.getByRole('button', { name: /^line$/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^pie$/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^horizontal bar$/i })).toBeNull();
  });

  it('"Add to page" добавляет карточку в dashboardStore и закрывает панель', () => {
    render(<ChartBuilderPanel />);
    fireEvent.click(screen.getByRole('button', { name: /add chart/i }));
    fireEvent.click(screen.getByRole('button', { name: /^add to page$/i }));

    const cards = useDashboardStore.getState().builderCards;
    expect(cards).toHaveLength(1);
    expect(cards[0].dimension).toBe('country');
    expect(cards[0].chartType).toBe('bar_h');
    expect(typeof cards[0].id).toBe('string');

    // Панель свернулась, показывается кнопка "+ Add chart"
    expect(screen.getByRole('button', { name: /add chart/i })).toBeTruthy();
    expect(screen.queryByRole('region', { name: /chart builder/i })).toBeNull();
  });

  it('"Cancel" закрывает панель без добавления карточки', () => {
    render(<ChartBuilderPanel />);
    fireEvent.click(screen.getByRole('button', { name: /add chart/i }));
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));

    expect(useDashboardStore.getState().builderCards).toHaveLength(0);
    expect(screen.getByRole('button', { name: /add chart/i })).toBeTruthy();
  });
});
