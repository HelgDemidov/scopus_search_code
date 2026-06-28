// Таблицы переводов для данных бэкенда (страны, типы документов, OA-статусы).
// Значения бэкенда всегда English — эти карты используются только для отображения.

export const COUNTRY_TRANSLATIONS_RU: Record<string, string> = {
  'United States': 'США',
  'China': 'Китай',
  'United Kingdom': 'Великобритания',
  'Germany': 'Германия',
  'Japan': 'Япония',
  'France': 'Франция',
  'Italy': 'Италия',
  'Canada': 'Канада',
  'Australia': 'Австралия',
  'South Korea': 'Южная Корея',
  'India': 'Индия',
  'Spain': 'Испания',
  'Netherlands': 'Нидерланды',
  'Brazil': 'Бразилия',
  'Switzerland': 'Швейцария',
  'Sweden': 'Швеция',
  'Russia': 'Россия',
  'Turkey': 'Турция',
  'Poland': 'Польша',
  'Belgium': 'Бельгия',
  'Denmark': 'Дания',
  'Austria': 'Австрия',
  'Norway': 'Норвегия',
  'Finland': 'Финляндия',
  'Israel': 'Израиль',
  'Singapore': 'Сингапур',
  'Portugal': 'Португалия',
  'Czech Republic': 'Чехия',
  'Greece': 'Греция',
  'Iran': 'Иран',
  'Mexico': 'Мексика',
  'Argentina': 'Аргентина',
  'South Africa': 'ЮАР',
  'New Zealand': 'Новая Зеландия',
  'Ireland': 'Ирландия',
  'Hungary': 'Венгрия',
  'Romania': 'Румыния',
  'Ukraine': 'Украина',
  'Croatia': 'Хорватия',
  'Slovakia': 'Словакия',
  'Thailand': 'Таиланд',
  'Malaysia': 'Малайзия',
  'Indonesia': 'Индонезия',
  'Vietnam': 'Вьетнам',
  'Philippines': 'Филиппины',
  'Saudi Arabia': 'Саудовская Аравия',
  'Egypt': 'Египет',
  'Nigeria': 'Нигерия',
  'Kenya': 'Кения',
  'Ethiopia': 'Эфиопия',
  'Pakistan': 'Пакистан',
  'Bangladesh': 'Бангладеш',
  'Sri Lanka': 'Шри-Ланка',
  'Taiwan': 'Тайвань',
  'Hong Kong': 'Гонконг',
  'Colombia': 'Колумбия',
  'Chile': 'Чили',
  'Peru': 'Перу',
  'Venezuela': 'Венесуэла',
  'Ecuador': 'Эквадор',
  'United Arab Emirates': 'ОАЭ',
  'Qatar': 'Катар',
  'Kuwait': 'Кувейт',
  'Jordan': 'Иордания',
  'Lebanon': 'Ливан',
  'Morocco': 'Марокко',
  'Algeria': 'Алжир',
  'Tunisia': 'Тунис',
  'Ghana': 'Гана',
  'Tanzania': 'Танзания',
  'Lithuania': 'Литва',
  'Latvia': 'Латвия',
  'Estonia': 'Эстония',
  'Bulgaria': 'Болгария',
  'Slovenia': 'Словения',
  'Serbia': 'Сербия',
  'Iceland': 'Исландия',
  'Luxembourg': 'Люксембург',
  'Malta': 'Мальта',
  'Cyprus': 'Кипр',
};

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
  'Erratum': 'Исправление',
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

export const COUNTRY_TRANSLATIONS_SR_LATN: Record<string, string> = {
  'United States': 'SAD',
  'China': 'Kina',
  'United Kingdom': 'Ujedinjeno Kraljevstvo',
  'Germany': 'Njemačka',
  'Japan': 'Japan',
  'France': 'Francuska',
  'Italy': 'Italija',
  'Canada': 'Kanada',
  'Australia': 'Australija',
  'South Korea': 'Južna Koreja',
  'India': 'Indija',
  'Spain': 'Španija',
  'Netherlands': 'Holandija',
  'Brazil': 'Brazil',
  'Switzerland': 'Švajcarska',
  'Sweden': 'Švedska',
  'Russia': 'Rusija',
  'Turkey': 'Turska',
  'Poland': 'Poljska',
  'Belgium': 'Belgija',
  'Denmark': 'Danska',
  'Austria': 'Austrija',
  'Norway': 'Norveška',
  'Finland': 'Finska',
  'Israel': 'Izrael',
  'Singapore': 'Singapur',
  'Portugal': 'Portugalija',
  'Czech Republic': 'Češka',
  'Greece': 'Grčka',
  'Iran': 'Iran',
  'Mexico': 'Meksiko',
  'Argentina': 'Argentina',
  'South Africa': 'Južna Afrika',
  'New Zealand': 'Novi Zeland',
  'Ireland': 'Irska',
  'Hungary': 'Mađarska',
  'Romania': 'Rumunija',
  'Ukraine': 'Ukrajina',
  'Croatia': 'Hrvatska',
  'Slovakia': 'Slovačka',
  'Thailand': 'Tajland',
  'Malaysia': 'Malezija',
  'Indonesia': 'Indonezija',
  'Vietnam': 'Vijetnam',
  'Philippines': 'Filipini',
  'Saudi Arabia': 'Saudijska Arabija',
  'Egypt': 'Egipat',
  'Nigeria': 'Nigerija',
  'Kenya': 'Kenija',
  'Ethiopia': 'Etiopija',
  'Pakistan': 'Pakistan',
  'Bangladesh': 'Bangladeš',
  'Sri Lanka': 'Šri Lanka',
  'Taiwan': 'Tajvan',
  'Hong Kong': 'Hong Kong',
  'Colombia': 'Kolumbija',
  'Chile': 'Čile',
  'Peru': 'Peru',
  'Venezuela': 'Venecuela',
  'Ecuador': 'Ekvador',
  'United Arab Emirates': 'UAE',
  'Qatar': 'Katar',
  'Kuwait': 'Kuvajt',
  'Jordan': 'Jordan',
  'Lebanon': 'Liban',
  'Morocco': 'Maroko',
  'Algeria': 'Alžir',
  'Tunisia': 'Tunis',
  'Ghana': 'Gana',
  'Tanzania': 'Tanzanija',
  'Lithuania': 'Litvanija',
  'Latvia': 'Letonija',
  'Estonia': 'Estonija',
  'Bulgaria': 'Bugarska',
  'Slovenia': 'Slovenija',
  'Serbia': 'Srbija',
  'Iceland': 'Island',
  'Luxembourg': 'Luksemburg',
  'Malta': 'Malta',
  'Cyprus': 'Kipar',
};

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
