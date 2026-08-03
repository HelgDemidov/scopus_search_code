// Статичные константы для Scopus-режима фильтрации.
// В каталог-режиме опции приходят из statsStore (реальные данные коллекции).
// Страны — см. constants/countries.ts (ALL_COUNTRIES, единая подложка для
// обоих режимов, задача 2026-08-03).

export const SCOPUS_DOC_TYPES = [
  'Article',
  'Review',
  'Conference Paper',
  'Book Chapter',
  'Editorial',
  'Letter',
  'Note',
  'Short Survey',
] as const;

export type ScopusDocType = (typeof SCOPUS_DOC_TYPES)[number];
