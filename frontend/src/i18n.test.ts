import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import i18n from './i18n';

// ---------------------------------------------------------------------------
// Вспомогательные функции и данные уровня модуля
// (доступны во всех describe-блоках без дублирования)
// ---------------------------------------------------------------------------

function flatKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    typeof v === 'object' && v !== null && !Array.isArray(v)
      ? flatKeys(v as Record<string, unknown>, prefix ? `${prefix}.${k}` : k)
      : [prefix ? `${prefix}.${k}` : k],
  );
}

const enBundle = i18n.getResourceBundle('en', 'translation') as Record<string, unknown>;
const enKeys = new Set(flatKeys(enBundle));

// ---------------------------------------------------------------------------
// Конфигурация
// ---------------------------------------------------------------------------

describe('i18n — конфигурация', () => {
  it('fallbackLng — английский', () => {
    const fb = i18n.options.fallbackLng;
    const langs = Array.isArray(fb) ? fb : [fb];
    expect(langs).toContain('en');
  });

  it('supportedLngs содержит en, ru и sr-Latn', () => {
    expect(i18n.options.supportedLngs).toContain('en');
    expect(i18n.options.supportedLngs).toContain('ru');
    expect(i18n.options.supportedLngs).toContain('sr-Latn');
  });

  it('ресурсы загружены для en, ru и sr-Latn', () => {
    expect(i18n.hasResourceBundle('en', 'translation')).toBe(true);
    expect(i18n.hasResourceBundle('ru', 'translation')).toBe(true);
    expect(i18n.hasResourceBundle('sr-Latn', 'translation')).toBe(true);
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
// SR-LATN переводы (черногорская латиница)
// ---------------------------------------------------------------------------

describe('i18n — SR-LATN переводы', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sr-Latn');
  });

  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('nav.explore → "Analitika"', () => {
    expect(i18n.t('nav.explore')).toBe('Analitika');
  });

  it('search.button → "Pretraži"', () => {
    expect(i18n.t('search.button')).toBe('Pretraži');
  });

  it('plural SR-LATN: 1 rezultat (one)', () => {
    expect(i18n.t('articles.resultsCount', { count: 1 })).toBe('1 rezultat');
  });

  it('plural SR-LATN: 2 rezultata (few)', () => {
    expect(i18n.t('articles.resultsCount', { count: 2 })).toBe('2 rezultata');
  });

  it('plural SR-LATN: 5 rezultata (other)', () => {
    expect(i18n.t('articles.resultsCount', { count: 5 })).toBe('5 rezultata');
  });

  it('plural SR-LATN: 11 rezultata (other — исключение для 11)', () => {
    expect(i18n.t('articles.resultsCount', { count: 11 })).toBe('11 rezultata');
  });

  it('plural SR-LATN: 21 rezultat (one — исключение для 21)', () => {
    expect(i18n.t('articles.resultsCount', { count: 21 })).toBe('21 rezultat');
  });
});

// ---------------------------------------------------------------------------
// Паритет ключей EN ↔ RU
// ---------------------------------------------------------------------------

describe('i18n — паритет ключей EN ↔ RU', () => {
  const ruBundle = i18n.getResourceBundle('ru', 'translation') as Record<string, unknown>;
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

// ---------------------------------------------------------------------------
// Паритет ключей EN ↔ SR-LATN
// ---------------------------------------------------------------------------

describe('i18n — паритет ключей EN ↔ SR-LATN', () => {
  const srLatnBundle = i18n.getResourceBundle('sr-Latn', 'translation') as Record<string, unknown>;
  const srLatnKeys = new Set(flatKeys(srLatnBundle));

  // sr-Latn не использует _many; _few есть в sr-Latn, но не в EN — оба исключены из проверки
  const srLatnOnlySuffixes = ['_few', '_many'];

  it('все EN-ключи присутствуют в SR-LATN', () => {
    const missing = [...enKeys].filter((k) => !srLatnKeys.has(k));
    expect(missing, `EN-ключи отсутствующие в SR-LATN: ${missing.join(', ')}`).toHaveLength(0);
  });

  it('все SR-LATN-ключи присутствуют в EN (кроме _few/_many форм)', () => {
    const missing = [...srLatnKeys].filter(
      (k) => !enKeys.has(k) && !srLatnOnlySuffixes.some((s) => k.endsWith(s)),
    );
    expect(missing, `SR-LATN-ключи отсутствующие в EN: ${missing.join(', ')}`).toHaveLength(0);
  });
});
