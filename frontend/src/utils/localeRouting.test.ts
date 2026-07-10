import { describe, expect, it } from 'vitest';
import {
  DEFAULT_URL_LANG,
  SUPPORTED_URL_LANGS,
  buildLocalizedPath,
  i18nToUrlLang,
  isSupportedUrlLang,
  swapLocaleInPath,
  urlLangToHreflang,
  urlLangToI18n,
} from './localeRouting';

describe('isSupportedUrlLang', () => {
  it('accepts all 3 registered locales', () => {
    expect(isSupportedUrlLang('en')).toBe(true);
    expect(isSupportedUrlLang('ru')).toBe(true);
    expect(isSupportedUrlLang('cnr')).toBe(true);
  });

  it('rejects unknown/undefined values', () => {
    expect(isSupportedUrlLang('sr-Latn')).toBe(false); // i18next-код, не URL-сегмент
    expect(isSupportedUrlLang('de')).toBe(false);
    expect(isSupportedUrlLang(undefined)).toBe(false);
    expect(isSupportedUrlLang('')).toBe(false);
  });
});

describe('urlLangToI18n / i18nToUrlLang', () => {
  it('are inverse mappings for all 3 locales', () => {
    for (const urlLang of SUPPORTED_URL_LANGS) {
      expect(i18nToUrlLang[urlLangToI18n[urlLang]]).toBe(urlLang);
    }
  });

  it('maps cnr (Montenegrin URL-сегмент) to i18next-ресурс sr-Latn', () => {
    expect(urlLangToI18n['cnr']).toBe('sr-Latn');
  });
});

describe('urlLangToHreflang', () => {
  it('cnr — hreflang совпадает с URL-сегментом (не с i18next-кодом sr-Latn)', () => {
    expect(urlLangToHreflang['cnr']).toBe('cnr');
  });

  it('en/ru — hreflang совпадает и с URL-сегментом, и с i18next-кодом', () => {
    expect(urlLangToHreflang['en']).toBe('en');
    expect(urlLangToHreflang['ru']).toBe('ru');
  });
});

describe('buildLocalizedPath', () => {
  it('prefixes a section path with the lang segment', () => {
    expect(buildLocalizedPath('ru', '/explore')).toBe('/ru/explore');
    expect(buildLocalizedPath('cnr', '/article/123')).toBe('/cnr/article/123');
  });

  it('adds a leading slash if the caller forgot one', () => {
    expect(buildLocalizedPath('en', 'search')).toBe('/en/search');
  });

  it('does not produce a trailing slash for the bare root path', () => {
    expect(buildLocalizedPath('en', '/')).toBe('/en');
  });
});

describe('swapLocaleInPath', () => {
  it('replaces only the first segment, keeps the rest', () => {
    expect(swapLocaleInPath('/ru/explore', 'en')).toBe('/en/explore');
    expect(swapLocaleInPath('/en/article/123', 'cnr')).toBe('/cnr/article/123');
  });

  it('handles a bare lang-only path (no section)', () => {
    expect(swapLocaleInPath('/ru', 'en')).toBe('/en');
  });
});

describe('DEFAULT_URL_LANG', () => {
  it('is itself a supported locale', () => {
    expect(isSupportedUrlLang(DEFAULT_URL_LANG)).toBe(true);
  });
});
