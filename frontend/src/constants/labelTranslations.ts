// Таблицы переводов для данных бэкенда (страны, типы документов, OA-статусы).
// Значения бэкенда всегда English — эти карты используются только для отображения.
//
// Страны — единая подложка в constants/countries.ts (используется и Scopus-,
// и catalog-режимом, задача 2026-08-03); здесь только реэкспорт под привычным
// именем, doc_type/OA остаются небольшими рукописными словарями прямо тут.
import { COUNTRY_TRANSLATIONS_RU, COUNTRY_TRANSLATIONS_SR_LATN } from './countries';
export { COUNTRY_TRANSLATIONS_RU, COUNTRY_TRANSLATIONS_SR_LATN };

export const DOC_TYPE_TRANSLATIONS_RU: Record<string, string> = {
  'Article': 'Статья',
  'Review': 'Обзор',
  'Conference Paper': 'Материалы конф.',
  'Book Chapter': 'Глава книги',
  'Editorial': 'Редакционная статья',
  'Letter': 'Письмо',
  'Note': 'Заметка',
  'Short Survey': 'Краткий обзор',
  'Data Paper': 'Статья о данных',
  'Retracted': 'Отозвана',
  'Erratum': 'Эрратум',
  'Book': 'Книга',
  'Conference Review': 'Обзор конференции',
  'Business Article': 'Деловая статья',
};

// Open Access — «Open Access» не переводится (международный стандарт, OQ-1).
// «Closed Access» — переводится.
export const OA_LABELS_RU: Record<string, string> = {
  'Open Access': 'Open Access',
  'Closed Access': 'Закрытый доступ',
};

// ---------------------------------------------------------------------------
// sr-Latn (черногорская латиница с иекавицей)
// ---------------------------------------------------------------------------

export const DOC_TYPE_TRANSLATIONS_SR_LATN: Record<string, string> = {
  'Article': 'Članak',
  'Review': 'Pregledni članak',
  'Conference Paper': 'Konferencijski rad',
  'Book Chapter': 'Poglavlje u knjizi',
  'Editorial': 'Uvodnik',
  'Letter': 'Pismo',
  'Note': 'Bilješka',
  'Short Survey': 'Kratki pregled',
  'Data Paper': 'Podatkovni članak',
  'Retracted': 'Povučen',
  'Erratum': 'Ispravka',
  'Book': 'Knjiga',
  'Conference Review': 'Pregled konferencije',
  'Business Article': 'Poslovni članak',
};

// Open Access — международный термин, не переводится (аналогично RU).
export const OA_LABELS_SR_LATN: Record<string, string> = {
  'Open Access': 'Open Access',
  'Closed Access': 'Zatvoreni pristup',
};

// ---------------------------------------------------------------------------
// Универсальный lookup по языку
// ---------------------------------------------------------------------------

export interface LangMaps {
  country: Record<string, string>;
  doc_type: Record<string, string>;
  oa: Record<string, string>;
}

const LANG_MAPS: Record<string, LangMaps> = {
  ru: { country: COUNTRY_TRANSLATIONS_RU, doc_type: DOC_TYPE_TRANSLATIONS_RU, oa: OA_LABELS_RU },
  'sr-Latn': { country: COUNTRY_TRANSLATIONS_SR_LATN, doc_type: DOC_TYPE_TRANSLATIONS_SR_LATN, oa: OA_LABELS_SR_LATN },
};

export function getLabelMaps(lang: string): LangMaps | null {
  return LANG_MAPS[lang] ?? null;
}

const TRANSLATED_LANGS = new Set(['ru', 'sr-Latn']);

// Переводит метку данных если язык поддерживает перевод, иначе возвращает оригинал.
export function translateDataLabel(
  label: string,
  lang: string,
  map: Record<string, string>,
): string {
  return TRANSLATED_LANGS.has(lang) ? (map[label] ?? label) : label;
}
