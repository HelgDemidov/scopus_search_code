import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LanguageSwitcher } from './LanguageSwitcher';
import i18n from '../../i18n';

// Stub Radix DropdownMenu — jsdom не поддерживает pointer-events
vi.mock('../ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: (props: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props} />
  ),
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: (props: React.HTMLAttributes<HTMLDivElement>) => (
    <div {...props} role="menuitem" />
  ),
}));

// Компонент теперь навигирует (URL — источник истины, §5 ТЗ), а не вызывает
// i18n.changeLanguage напрямую — mockNavigate ловит фактическую навигацию,
// синхронизация i18n.language из :lang проверяется отдельно в LocaleLayout.test.tsx.
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

function renderSwitcher(initialPath = '/en/search') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <LanguageSwitcher />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockNavigate.mockClear();
});

afterEach(async () => {
  await i18n.changeLanguage('en');
});

describe('LanguageSwitcher', () => {
  it('рендерит кнопку с текущим языком EN по умолчанию', async () => {
    await i18n.changeLanguage('en');
    renderSwitcher();
    const btn = screen.getByRole('button', { name: 'Switch language' });
    expect(btn.textContent).toContain('EN');
  });

  it('показывает текущий язык — русский', async () => {
    await i18n.changeLanguage('ru');
    renderSwitcher();
    const btn = screen.getByRole('button', { name: 'Сменить язык' });
    expect(btn.textContent).toContain('РУ');
  });

  it('показывает текущий язык — sr-Latn', async () => {
    await i18n.changeLanguage('sr-Latn');
    renderSwitcher();
    const btn = screen.getByRole('button', { name: 'Promijeni jezik' });
    expect(btn.textContent).toContain('CG');
  });

  it('aria-label — "Switch language" на английском', async () => {
    await i18n.changeLanguage('en');
    renderSwitcher();
    expect(screen.getByRole('button', { name: 'Switch language' })).toBeTruthy();
  });

  it('aria-label — "Сменить язык" на русском', async () => {
    await i18n.changeLanguage('ru');
    renderSwitcher();
    expect(screen.getByRole('button', { name: 'Сменить язык' })).toBeTruthy();
  });

  it('показывает все три опции', async () => {
    await i18n.changeLanguage('en');
    renderSwitcher();
    expect(screen.getByRole('menuitem', { name: 'EN' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'РУ' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'CG' })).toBeTruthy();
  });

  it('активный язык имеет aria-current="true"', async () => {
    await i18n.changeLanguage('ru');
    renderSwitcher();
    expect(screen.getByRole('menuitem', { name: 'РУ' }).getAttribute('aria-current')).toBe('true');
    expect(screen.getByRole('menuitem', { name: 'EN' }).getAttribute('aria-current')).toBeNull();
  });

  it('переключает на русский при клике РУ — сохраняет остаток пути', async () => {
    await i18n.changeLanguage('en');
    renderSwitcher('/en/search');
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'РУ' }));
    });
    expect(mockNavigate).toHaveBeenCalledWith('/ru/search');
  });

  it('переключает на sr-Latn при клике CG', async () => {
    await i18n.changeLanguage('en');
    renderSwitcher('/en/explore');
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'CG' }));
    });
    expect(mockNavigate).toHaveBeenCalledWith('/sr-latn/explore');
  });

  it('переключает на английский с sr-Latn', async () => {
    await i18n.changeLanguage('sr-Latn');
    renderSwitcher('/sr-latn/main');
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'EN' }));
    });
    expect(mockNavigate).toHaveBeenCalledWith('/en/main');
  });

  it('сохраняет query-строку при смене языка', async () => {
    await i18n.changeLanguage('en');
    renderSwitcher('/en/explore?mode=personal');
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'РУ' }));
    });
    expect(mockNavigate).toHaveBeenCalledWith('/ru/explore?mode=personal');
  });
});
