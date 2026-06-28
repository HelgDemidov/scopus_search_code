import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { LanguageSwitcher } from './LanguageSwitcher';
import i18n from '../../i18n';

afterEach(async () => {
  await i18n.changeLanguage('en');
});

describe('LanguageSwitcher', () => {
  it('рендерит select с тремя опциями: EN, РУ, CG', async () => {
    await i18n.changeLanguage('en');
    render(<LanguageSwitcher />);
    expect(screen.getByRole('combobox', { name: 'Switch language' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'EN' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'РУ' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'CG' })).toBeTruthy();
  });

  it('EN выбран по умолчанию', async () => {
    await i18n.changeLanguage('en');
    render(<LanguageSwitcher />);
    expect(screen.getByDisplayValue('EN')).toBeTruthy();
  });

  it('показывает текущий язык как выбранный — русский', async () => {
    await i18n.changeLanguage('ru');
    render(<LanguageSwitcher />);
    expect(screen.getByDisplayValue('РУ')).toBeTruthy();
  });

  it('показывает текущий язык как выбранный — sr-Latn', async () => {
    await i18n.changeLanguage('sr-Latn');
    render(<LanguageSwitcher />);
    expect(screen.getByDisplayValue('CG')).toBeTruthy();
  });

  it('aria-label — "Switch language" на английском', async () => {
    await i18n.changeLanguage('en');
    render(<LanguageSwitcher />);
    expect(screen.getByRole('combobox', { name: 'Switch language' })).toBeTruthy();
  });

  it('aria-label — "Сменить язык" на русском', async () => {
    await i18n.changeLanguage('ru');
    render(<LanguageSwitcher />);
    expect(screen.getByRole('combobox', { name: 'Сменить язык' })).toBeTruthy();
  });

  it('переключает на русский при выборе РУ', async () => {
    await i18n.changeLanguage('en');
    render(<LanguageSwitcher />);
    await act(async () => {
      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'ru' } });
    });
    await waitFor(() => expect(i18n.language).toBe('ru'));
  });

  it('переключает на sr-Latn при выборе CG', async () => {
    await i18n.changeLanguage('en');
    render(<LanguageSwitcher />);
    await act(async () => {
      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'sr-Latn' } });
    });
    await waitFor(() => expect(i18n.language).toBe('sr-Latn'));
  });

  it('переключает на английский с sr-Latn', async () => {
    await i18n.changeLanguage('sr-Latn');
    render(<LanguageSwitcher />);
    await act(async () => {
      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'en' } });
    });
    await waitFor(() => expect(i18n.language).toBe('en'));
  });
});
