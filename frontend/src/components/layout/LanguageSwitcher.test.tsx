import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { LanguageSwitcher } from './LanguageSwitcher';
import i18n from '../../i18n';

afterEach(async () => {
  await i18n.changeLanguage('en');
});

describe('LanguageSwitcher', () => {
  it('показывает три кнопки: EN, РУ, CG', async () => {
    await i18n.changeLanguage('en');
    render(<LanguageSwitcher />);
    expect(screen.getByText('EN')).toBeTruthy();
    expect(screen.getByText('РУ')).toBeTruthy();
    expect(screen.getByText('CG')).toBeTruthy();
  });

  it('EN кнопка aria-pressed=true когда язык — английский', async () => {
    await i18n.changeLanguage('en');
    render(<LanguageSwitcher />);
    expect(screen.getByText('EN').closest('button')?.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('РУ').closest('button')?.getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByText('CG').closest('button')?.getAttribute('aria-pressed')).toBe('false');
  });

  it('РУ кнопка aria-pressed=true когда язык — русский', async () => {
    await i18n.changeLanguage('ru');
    render(<LanguageSwitcher />);
    expect(screen.getByText('РУ').closest('button')?.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('EN').closest('button')?.getAttribute('aria-pressed')).toBe('false');
  });

  it('CG кнопка aria-pressed=true когда язык — sr-Latn', async () => {
    await i18n.changeLanguage('sr-Latn');
    render(<LanguageSwitcher />);
    expect(screen.getByText('CG').closest('button')?.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('EN').closest('button')?.getAttribute('aria-pressed')).toBe('false');
  });

  it('контейнер имеет aria-label из t("a11y.switchLanguage")', async () => {
    await i18n.changeLanguage('en');
    render(<LanguageSwitcher />);
    expect(screen.getByRole('group', { name: 'Switch language' })).toBeTruthy();
  });

  it('клик на РУ переключает на русский', async () => {
    await i18n.changeLanguage('en');
    render(<LanguageSwitcher />);
    await act(async () => { fireEvent.click(screen.getByText('РУ')); });
    await waitFor(() => expect(i18n.language).toBe('ru'));
  });

  it('клик на CG переключает на sr-Latn', async () => {
    await i18n.changeLanguage('en');
    render(<LanguageSwitcher />);
    await act(async () => { fireEvent.click(screen.getByText('CG')); });
    await waitFor(() => expect(i18n.language).toBe('sr-Latn'));
  });

  it('клик на EN переключает на английский с sr-Latn', async () => {
    await i18n.changeLanguage('sr-Latn');
    render(<LanguageSwitcher />);
    await act(async () => { fireEvent.click(screen.getByText('EN')); });
    await waitFor(() => expect(i18n.language).toBe('en'));
  });
});
