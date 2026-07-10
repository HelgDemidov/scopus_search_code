import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { LocaleLayout } from './LocaleLayout';
import i18n from '../../i18n';

// NotFoundPage (рендерится при невалидном :lang) через ErrorPanel безусловно
// вызывает useMediaQuery — jsdom не реализует matchMedia (тот же паттерн,
// что в NotFoundPage.test.tsx).
function stubMatchMedia() {
  vi.stubGlobal('matchMedia', vi.fn().mockImplementation((q: string) => ({
    matches: false,
    media: q,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as MediaQueryList)));
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path=":lang/*" element={<LocaleLayout />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  stubMatchMedia();
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await i18n.changeLanguage('en'); // не протекать язык между тестами
});

describe('LocaleLayout', () => {
  it('рендерит NotFoundPage при невалидном :lang, без изменения i18n.language/document.lang', async () => {
    await i18n.changeLanguage('en');
    document.documentElement.lang = 'en';
    renderAt('/xx/whatever');
    expect(await screen.findByText('NO SIGNAL')).toBeInTheDocument();
    expect(i18n.language).toBe('en');
    expect(document.documentElement.lang).toBe('en');
  });

  it('синхронизирует i18n.language и document.documentElement.lang при валидном :lang=ru', async () => {
    renderAt('/ru/whatever');
    await waitFor(() => expect(i18n.language).toBe('ru'));
    expect(document.documentElement.lang).toBe('ru');
  });

  it('cnr (URL-сегмент, Montenegrin) резолвится в i18next-ресурс sr-Latn', async () => {
    renderAt('/cnr/whatever');
    await waitFor(() => expect(i18n.language).toBe('sr-Latn'));
    expect(document.documentElement.lang).toBe('sr-Latn');
  });

  it('не вызывает changeLanguage повторно, если i18n.language уже совпадает с :lang', async () => {
    await i18n.changeLanguage('en');
    const spy = vi.spyOn(i18n, 'changeLanguage');
    renderAt('/en/whatever');
    await waitFor(() => expect(document.documentElement.lang).toBe('en'));
    expect(spy).not.toHaveBeenCalled();
  });
});
