import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import i18n from './i18n';

// ---------------------------------------------------------------------------
// Конфигурация
// ---------------------------------------------------------------------------

describe('i18n — конфигурация', () => {
  it('fallbackLng — английский', () => {
    const fb = i18n.options.fallbackLng;
    const langs = Array.isArray(fb) ? fb : [fb];
    expect(langs).toContain('en');
  });

  it('supportedLngs содержит en и ru', () => {
    expect(i18n.options.supportedLngs).toContain('en');
    expect(i18n.options.supportedLngs).toContain('ru');
  });

  it('ресурсы загружены для en и ru', () => {
    expect(i18n.hasResourceBundle('en', 'translation')).toBe(true);
    expect(i18n.hasResourceBundle('ru', 'translation')).toBe(true);
  });

  it('порядок определения языка: localStorage первый', () => {
    const detection = i18n.options.detection as { order: string[] } | undefined;
    expect(detection?.order?.[0]).toBe('localStorage');
  });

  it('ключ localStorage — "i18n_lang"', () => {
    const detection = i18n.options.detection as { lookupLocalStorage: string } | undefined;
    expect(detection?.lookupLocalStorage).toBe('i18n_lang');
  });
});

// ---------------------------------------------------------------------------
// Английские переводы
// ---------------------------------------------------------------------------

describe('i18n — EN переводы', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('nav.explore → "Explore"', () => {
    expect(i18n.t('nav.explore')).toBe('Explore');
  });

  it('search.button → "Search"', () => {
    expect(i18n.t('search.button')).toBe('Search');
  });

  it('интерполяция: search.minLength c min=3', () => {
    expect(i18n.t('search.minLength', { min: 3 })).toBe('Enter at least 3 characters');
  });

  it('plural EN: 1 result (one)', () => {
    expect(i18n.t('articles.resultsCount', { count: 1 })).toBe('1 result');
  });

  it('plural EN: 5 results (other)', () => {
    expect(i18n.t('articles.resultsCount', { count: 5 })).toBe('5 results');
  });
});

// ---------------------------------------------------------------------------
// Русские переводы
// ---------------------------------------------------------------------------

describe('i18n — RU переводы', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('ru');
  });

  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('nav.explore → "Аналитика"', () => {
    expect(i18n.t('nav.explore')).toBe('Аналитика');
  });

  it('search.button → "Найти"', () => {
    expect(i18n.t('search.button')).toBe('Найти');
  });

  it('интерполяция: search.minLength c min=3', () => {
    expect(i18n.t('search.minLength', { min: 3 })).toBe('Введите не менее 3 символов');
  });

  it('plural RU: 1 результат (one)', () => {
    expect(i18n.t('articles.resultsCount', { count: 1 })).toBe('1 результат');
  });

  it('plural RU: 2 результата (few)', () => {
    expect(i18n.t('articles.resultsCount', { count: 2 })).toBe('2 результата');
  });

  it('plural RU: 5 результатов (many)', () => {
    expect(i18n.t('articles.resultsCount', { count: 5 })).toBe('5 результатов');
  });

  it('plural RU: 11 результатов (many — исключение для 11)', () => {
    expect(i18n.t('articles.resultsCount', { count: 11 })).toBe('11 результатов');
  });

  it('plural RU: 21 результат (one — исключение для 21)', () => {
    expect(i18n.t('articles.resultsCount', { count: 21 })).toBe('21 результат');
  });
});

// ---------------------------------------------------------------------------
// Паритет ключей EN ↔ RU
// ---------------------------------------------------------------------------

describe('i18n — паритет ключей переводов', () => {
  function flatKeys(obj: Record<string, unknown>, prefix = ''): string[] {
    return Object.entries(obj).flatMap(([k, v]) =>
      typeof v === 'object' && v !== null && !Array.isArray(v)
        ? flatKeys(v as Record<string, unknown>, prefix ? `${prefix}.${k}` : k)
        : [prefix ? `${prefix}.${k}` : k],
    );
  }

  const enBundle = i18n.getResourceBundle('en', 'translation') as Record<string, unknown>;
  const ruBundle = i18n.getResourceBundle('ru', 'translation') as Record<string, unknown>;
  const enKeys = new Set(flatKeys(enBundle));
  const ruKeys = new Set(flatKeys(ruBundle));

  // RU может иметь _few/_many которых нет в EN — нормально для CLDR
  const pluralOnlySuffixes = ['_few', '_many'];

  it('все EN-ключи присутствуют в RU', () => {
    const missing = [...enKeys].filter((k) => !ruKeys.has(k));
    expect(missing, `EN-ключи отсутствующие в RU: ${missing.join(', ')}`).toHaveLength(0);
  });

  it('все RU-ключи присутствуют в EN (кроме _few/_many форм)', () => {
    const missing = [...ruKeys].filter(
      (k) => !enKeys.has(k) && !pluralOnlySuffixes.some((s) => k.endsWith(s)),
    );
    expect(missing, `RU-ключи отсутствующие в EN: ${missing.join(', ')}`).toHaveLength(0);
  });
});
