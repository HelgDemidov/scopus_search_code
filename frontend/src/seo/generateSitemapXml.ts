import {
  DEFAULT_URL_LANG,
  SUPPORTED_URL_LANGS,
  buildLocalizedPath,
  urlLangToHreflang,
} from '../utils/localeRouting';

export interface IndexableSection {
  path: string;
  titleKey: string;
  descriptionKey: string;
}

export const SITE_ORIGIN = 'https://scopus-search-code.vercel.app';

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Строит sitemap.xml с перекрёстными hreflang-блоками (docs/i18n-url-routing/spec.md
 * §6) из общего манифеста индексируемых секций — того же, что читает useHreflangTags.tsx.
 * `xhtml:link` — Google поддерживает hreflang прямо в sitemap как первичный канал,
 * не зависящий от JS-рендеринга страницы.
 */
export function generateSitemapXml(sections: IndexableSection[], lastmod: string): string {
  const urlEntries: string[] = [];

  for (const { path: sectionPath } of sections) {
    for (const lang of SUPPORTED_URL_LANGS) {
      const loc = `${SITE_ORIGIN}${buildLocalizedPath(lang, sectionPath)}`;

      const alternates = SUPPORTED_URL_LANGS.map((altLang) => {
        const href = `${SITE_ORIGIN}${buildLocalizedPath(altLang, sectionPath)}`;
        return `    <xhtml:link rel="alternate" hreflang="${urlLangToHreflang[altLang]}" href="${xmlEscape(href)}"/>`;
      });
      const xDefaultHref = `${SITE_ORIGIN}${buildLocalizedPath(DEFAULT_URL_LANG, sectionPath)}`;
      alternates.push(
        `    <xhtml:link rel="alternate" hreflang="x-default" href="${xmlEscape(xDefaultHref)}"/>`,
      );

      urlEntries.push(
        [
          '  <url>',
          `    <loc>${xmlEscape(loc)}</loc>`,
          `    <lastmod>${lastmod}</lastmod>`,
          '    <changefreq>weekly</changefreq>',
          // Голая маркетинговая /main — приоритет 1.0, остальные 5 секций — 0.8
          `    <priority>${sectionPath === '/main' ? '1.0' : '0.8'}</priority>`,
          ...alternates,
          '  </url>',
        ].join('\n'),
      );
    }
  }

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...urlEntries,
    '</urlset>',
    '',
  ].join('\n');
}
