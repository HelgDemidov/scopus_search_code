import { Helmet } from 'react-helmet-async';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import indexableSections from '../seo/indexableSections.json';
import {
  DEFAULT_URL_LANG,
  SUPPORTED_URL_LANGS,
  buildLocalizedPath,
  isSupportedUrlLang,
  urlLangToHreflang,
} from '../utils/localeRouting';

// Единственный источник домена — используется здесь и в scripts/generate-sitemap.ts
// (через src/seo/generateSitemapXml.ts — общую типизированную функцию).
const SITE_ORIGIN = 'https://scopus-search-code.vercel.app';

/**
 * Per-page SEO-теги через react-helmet-async (docs/i18n-url-routing/spec.md §6):
 * title/description (i18n `seo.*`, из общего манифеста indexableSections.json —
 * того же, что использует scripts/generate-sitemap.ts, чтобы hreflang-пары
 * не разъезжались с самим sitemap), canonical на текущую локаль + 3 alternate
 * + x-default → en.
 *
 * `path` — канонический (без /{lang}) путь страницы, например '/about'. Только
 * для 6 индексируемых секций из манифеста; на других страницах (auth/profile/
 * article/:id/error-страницы) не используется — не в скоупе п.5 ТЗ.
 */
export function useHreflangTags(path: string) {
  const { t } = useTranslation();
  const { lang } = useParams<{ lang: string }>();
  const resolvedLang = isSupportedUrlLang(lang) ? lang : DEFAULT_URL_LANG;
  const section = indexableSections.find((s) => s.path === path);

  // titleKey/descriptionKey приходят из JSON (типизированы как string, не как
  // литеральный union известных ключей) — `as never` осознанно обходит строгую
  // типизацию t() для этого единственного места с runtime-вычисляемым ключом;
  // корректность самих ключей гарантирует CI parity-check (EN↔RU↔SR-LATN).
  return (
    <Helmet>
      {section && <title>{t(section.titleKey as never)}</title>}
      {section && <meta name="description" content={t(section.descriptionKey as never)} />}
      <link rel="canonical" href={`${SITE_ORIGIN}${buildLocalizedPath(resolvedLang, path)}`} />
      {SUPPORTED_URL_LANGS.map((urlLang) => (
        <link
          key={urlLang}
          rel="alternate"
          hrefLang={urlLangToHreflang[urlLang]}
          href={`${SITE_ORIGIN}${buildLocalizedPath(urlLang, path)}`}
        />
      ))}
      <link
        rel="alternate"
        hrefLang="x-default"
        href={`${SITE_ORIGIN}${buildLocalizedPath(DEFAULT_URL_LANG, path)}`}
      />
    </Helmet>
  );
}
