import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { LanguageSwitcher } from './LanguageSwitcher';
import i18n from '../../i18n';

afterEach(async () => {
  await i18n.changeLanguage('en');
});

describe('LanguageSwitcher', () => {
  it('показывает "РУ" когда текущий язык — английский', async () => {
    await i18n.changeLanguage('en');
    render(<LanguageSwitcher />);
    expect(screen.getByRole('button').textContent).toBe('РУ');
  });

  it('показывает "EN" когда текущий язык — русский', async () => {
    await i18n.changeLanguage('ru');
    render(<LanguageSwitcher />);
    expect(screen.getByRole('button').textContent).toBe('EN');
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

  it('переключает en → ru при клике', async () => {
    await i18n.changeLanguage('en');
    render(<LanguageSwitcher />);
    await act(async () => { fireEvent.click(screen.getByRole('button')); });
    await waitFor(() => expect(screen.getByRole('button').textContent).toBe('EN'));
  });

  it('переключает ru → en при клике', async () => {
    await i18n.changeLanguage('ru');
    render(<LanguageSwitcher />);
    await act(async () => { fireEvent.click(screen.getByRole('button')); });
    await waitFor(() => expect(screen.getByRole('button').textContent).toBe('РУ'));
  });
});
