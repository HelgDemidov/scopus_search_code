// URL — источник истины для текущей локали на время сессии (docs/i18n-url-routing/spec.md
// §1/§5): здесь только чистые функции сопоставления URL-сегмента ↔ код i18next и построения
// локализованных путей. Синхронизация с рантаймом i18next (changeLanguage/document.lang) —
// в LocaleLayout.tsx, не здесь.

export const SUPPORTED_URL_LANGS = ['en', 'ru', 'cnr'] as const;
export type UrlLang = (typeof SUPPORTED_URL_LANGS)[number];
export const DEFAULT_URL_LANG: UrlLang = 'en';

// URL-сегмент → код i18next-ресурса (sr-Latn — так называется папка/resources-ключ в i18n.ts;
// НЕ переименована вместе с URL-сегментом: плюральные формы (_one/_few/_other) и
// labelTranslations.ts завязаны на этот код, трогать — лишний риск без выгоды). URL-сегмент
// 'cnr' (ISO 639-3, Montenegrin) выбран вместо 'sr-latn' — черногорская иекавица официально
// отдельный язык с 2007 г. (конституция ЧГ) и отдельным кодом с 2017 г.; см. прецеденты
// в вебе (Wikimedia Incubator Wp/cnr, montenegro.travel ?_locale=cnr).
export const urlLangToI18n: Record<UrlLang, string> = {
  en: 'en',
  ru: 'ru',
  cnr: 'sr-Latn',
};

export const i18nToUrlLang: Record<string, UrlLang> = {
  en: 'en',
  ru: 'ru',
  'sr-Latn': 'cnr',
};

// URL-сегмент → значение hreflang-атрибута (docs/i18n-url-routing/spec.md §6). Отдельная
// от urlLangToI18n карта: hreflang — публичное SEO-заявление языка, i18next-код — реальный
// загружаемый ресурс. Для 'cnr' они расходятся (i18next грузит 'sr-Latn' — hreflang должен
// сказать 'cnr', иначе URL заявляет "черногорский", а разметка — "сербский", рассогласование).
export const urlLangToHreflang: Record<UrlLang, string> = {
  en: 'en',
  ru: 'ru',
  cnr: 'cnr',
};

export function isSupportedUrlLang(value: string | undefined): value is UrlLang {
  return !!value && (SUPPORTED_URL_LANGS as readonly string[]).includes(value);
}

/** '/explore' + 'ru' → '/ru/explore'; '/' + 'ru' → '/ru' (без висячего слэша). */
export function buildLocalizedPath(lang: UrlLang, path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return normalized === '/' ? `/${lang}` : `/${lang}${normalized}`;
}

/** Меняет только 1-й сегмент пути (язык), остальную часть пути сохраняет как есть.
 * Если 1-й сегмент текущего пути не распознан как язык (напр. /auth/callback,
 * /reset-password — исключения из схемы локализации, §7 ТЗ), весь путь считается
 * "остатком" и новый язык просто добавляется спереди — вызывающий код (LanguageSwitcher)
 * не показывается на этих 2 роутах, так что этот случай не встречается на практике. */
export function swapLocaleInPath(pathname: string, newLang: UrlLang): string {
  const segments = pathname.split('/').filter(Boolean);
  const rest = isSupportedUrlLang(segments[0]) ? segments.slice(1) : segments;
  const restPath = rest.length ? `/${rest.join('/')}` : '';
  return `/${newLang}${restPath}`;
}
