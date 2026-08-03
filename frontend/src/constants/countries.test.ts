// Тесты для единой подложки стран (constants/countries.ts) — задача 2026-08-03:
// объединение catalog- и scopus-режимов на одном источнике ISO 3166-1 (250,
// через i18n-iso-countries) вместо двух независимых, несинхронизированных
// списков.

import { describe, expect, it } from 'vitest';
import { ALL_COUNTRIES, COUNTRY_TRANSLATIONS_RU, COUNTRY_TRANSLATIONS_SR_LATN } from './countries';

describe('ALL_COUNTRIES — полнота и уникальность', () => {
  it('содержит ровно 250 стран (249 ISO 3166-1 + Косово, XK)', () => {
    expect(ALL_COUNTRIES).toHaveLength(250);
  });

  it('не содержит дублей', () => {
    expect(new Set(ALL_COUNTRIES).size).toBe(ALL_COUNTRIES.length);
  });

  it('не содержит пустых строк', () => {
    expect(ALL_COUNTRIES.every((c) => c.trim().length > 0)).toBe(true);
  });
});

describe('COUNTRY_TRANSLATIONS_RU/SR_LATN — полное покрытие ALL_COUNTRIES', () => {
  // Ядро регрессии: раньше словари переводов покрывали только старые 80
  // Scopus-стран — страна из statsStore вне этого множества (полностью
  // реалистично на растущей коллекции) тихо откатывалась на английский
  // текст вместо перевода (см. обсуждение в чате 2026-08-03).
  it('RU: каждая страна из ALL_COUNTRIES имеет перевод', () => {
    const missing = ALL_COUNTRIES.filter((c) => !(c in COUNTRY_TRANSLATIONS_RU));
    expect(missing).toEqual([]);
  });

  it('sr-Latn: каждая страна из ALL_COUNTRIES имеет перевод', () => {
    const missing = ALL_COUNTRIES.filter((c) => !(c in COUNTRY_TRANSLATIONS_SR_LATN));
    expect(missing).toEqual([]);
  });

  it('RU: нет лишних ключей вне ALL_COUNTRIES (подложка синхронизирована)', () => {
    const allSet = new Set(ALL_COUNTRIES);
    const extra = Object.keys(COUNTRY_TRANSLATIONS_RU).filter((k) => !allSet.has(k as (typeof ALL_COUNTRIES)[number]));
    expect(extra).toEqual([]);
  });

  it('sr-Latn: нет лишних ключей вне ALL_COUNTRIES (подложка синхронизирована)', () => {
    const allSet = new Set(ALL_COUNTRIES);
    const extra = Object.keys(COUNTRY_TRANSLATIONS_SR_LATN).filter((k) => !allSet.has(k as (typeof ALL_COUNTRIES)[number]));
    expect(extra).toEqual([]);
  });

  it('RU: переводы не пустые и не совпадают с оригиналом (реально переведены)', () => {
    // Открытые кейсы вроде "Open Access" не переводятся намеренно — но для
    // стран английское название почти никогда не совпадает с русским, кроме
    // редких международных заимствований (Japan/Japan? — нет такого среди стран)
    const untranslated = ALL_COUNTRIES.filter((c) => COUNTRY_TRANSLATIONS_RU[c] === c);
    expect(untranslated).toEqual([]);
  });
});

describe('Значения ALL_COUNTRIES, уходящие в Scopus CQL — обратная совместимость', () => {
  // Страны, ранее уже присутствовавшие в проверенном списке SCOPUS_COUNTRIES
  // (80 шт., до объединения подложки) — их EN-значение обязано остаться
  // БУКВАЛЬНО прежним. Пакет i18n-iso-countries для части из них по умолчанию
  // отдаёт формальное имя (Russia -> Russian Federation, United States ->
  // United States of America, Turkey -> Türkiye, Taiwan -> Taiwan, Province
  // of China) — если бы значение сменилось, live-поиск по Scopus для этой
  // страны перестал бы находить статьи (AFFILCOUNTRY подставляется как есть,
  // app/infrastructure/scopus_client.py, без allowlist/маппинга на бэкенде).
  const PREVIOUSLY_CURATED = [
    'United States', 'China', 'United Kingdom', 'Germany', 'Japan', 'France',
    'Italy', 'Canada', 'Australia', 'South Korea', 'India', 'Spain',
    'Netherlands', 'Brazil', 'Switzerland', 'Sweden', 'Russia', 'Turkey',
    'Poland', 'Belgium', 'Denmark', 'Austria', 'Norway', 'Finland', 'Israel',
    'Singapore', 'Portugal', 'Czech Republic', 'Greece', 'Iran', 'Mexico',
    'Argentina', 'South Africa', 'New Zealand', 'Ireland', 'Hungary',
    'Romania', 'Ukraine', 'Croatia', 'Slovakia', 'Thailand', 'Malaysia',
    'Indonesia', 'Vietnam', 'Philippines', 'Saudi Arabia', 'Egypt', 'Nigeria',
    'Kenya', 'Ethiopia', 'Pakistan', 'Bangladesh', 'Sri Lanka', 'Taiwan',
    'Hong Kong', 'Colombia', 'Chile', 'Peru', 'Venezuela', 'Ecuador',
    'United Arab Emirates', 'Qatar', 'Kuwait', 'Jordan', 'Lebanon', 'Morocco',
    'Algeria', 'Tunisia', 'Ghana', 'Tanzania', 'Lithuania', 'Latvia',
    'Estonia', 'Bulgaria', 'Slovenia', 'Serbia', 'Iceland', 'Luxembourg',
    'Malta', 'Cyprus',
  ] as const;

  it('все 80 ранее валидированных значений сохранены дословно в ALL_COUNTRIES', () => {
    expect(PREVIOUSLY_CURATED).toHaveLength(80);
    const allSet = new Set(ALL_COUNTRIES);
    const missing = PREVIOUSLY_CURATED.filter((c) => !allSet.has(c));
    expect(missing).toEqual([]);
  });

  it('не содержит формальных ISO-имён вместо разговорных для этих 80 стран', () => {
    const allSet = new Set(ALL_COUNTRIES);
    // Формальные варианты, которые пакет мог бы подставить вместо привычных —
    // ни одного из них быть не должно
    const formalVariants = [
      'Russian Federation', 'United States of America', 'Türkiye',
      'Taiwan, Province of China', 'Korea, Republic of', 'Czechia',
    ];
    for (const formal of formalVariants) {
      expect(allSet.has(formal as (typeof ALL_COUNTRIES)[number])).toBe(false);
    }
  });
});

describe('Congo — неоднозначность разрешена (CD/CG не совпадают)', () => {
  // Обе страны Конго имеют alias "Congo" в пакете i18n-iso-countries —
  // наивный автоматический выбор alias дал бы коллизию (обе стали бы просто
  // "Congo"), поэтому обе намеренно оставлены полными разграничивающими
  // названиями
  it('Democratic Republic of the Congo и Republic of the Congo — разные, обе присутствуют', () => {
    expect(ALL_COUNTRIES).toContain('Democratic Republic of the Congo');
    expect(ALL_COUNTRIES).toContain('Republic of the Congo');
    expect(ALL_COUNTRIES).not.toContain('Congo');
  });
});
