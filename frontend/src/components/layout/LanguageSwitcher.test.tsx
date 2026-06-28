import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
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

afterEach(async () => {
  await i18n.changeLanguage('en');
});

describe('LanguageSwitcher', () => {
  it('рендерит кнопку с текущим языком EN по умолчанию', async () => {
    await i18n.changeLanguage('en');
    render(<LanguageSwitcher />);
    const btn = screen.getByRole('button', { name: 'Switch language' });
    expect(btn.textContent).toContain('EN');
  });

  it('показывает текущий язык — русский', async () => {
    await i18n.changeLanguage('ru');
    render(<LanguageSwitcher />);
    const btn = screen.getByRole('button', { name: 'Сменить язык' });
    expect(btn.textContent).toContain('РУ');
  });

  it('показывает текущий язык — sr-Latn', async () => {
    await i18n.changeLanguage('sr-Latn');
    render(<LanguageSwitcher />);
    const btn = screen.getByRole('button', { name: 'Promijeni jezik' });
    expect(btn.textContent).toContain('CG');
  });

  it('aria-label — "Switch language" на английском', async () => {
    await i18n.changeLanguage('en');
    render(<LanguageSwitcher />);
    expect(screen.getByRole('button', { name: 'Switch language' })).toBeTruthy();
  });

  it('aria-label — "Сменить язык" на русском', async () => {
    await i18n.changeLanguage('ru');
    render(<LanguageSwitcher />);
    expect(screen.getByRole('button', { name: 'Сменить язык' })).toBeTruthy();
  });

  it('показывает все три опции', async () => {
    await i18n.changeLanguage('en');
    render(<LanguageSwitcher />);
    expect(screen.getByRole('menuitem', { name: 'EN' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'РУ' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'CG' })).toBeTruthy();
  });

  it('активный язык имеет aria-current="true"', async () => {
    await i18n.changeLanguage('ru');
    render(<LanguageSwitcher />);
    expect(screen.getByRole('menuitem', { name: 'РУ' }).getAttribute('aria-current')).toBe('true');
    expect(screen.getByRole('menuitem', { name: 'EN' }).getAttribute('aria-current')).toBeNull();
  });

  it('переключает на русский при клике РУ', async () => {
    await i18n.changeLanguage('en');
    render(<LanguageSwitcher />);
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'РУ' }));
    });
    await waitFor(() => expect(i18n.language).toBe('ru'));
  });

  it('переключает на sr-Latn при клике CG', async () => {
    await i18n.changeLanguage('en');
    render(<LanguageSwitcher />);
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'CG' }));
    });
    await waitFor(() => expect(i18n.language).toBe('sr-Latn'));
  });

  it('переключает на английский с sr-Latn', async () => {
    await i18n.changeLanguage('sr-Latn');
    render(<LanguageSwitcher />);
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'EN' }));
    });
    await waitFor(() => expect(i18n.language).toBe('en'));
  });
});
