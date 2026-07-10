import { useEffect } from 'react';
import { Outlet, useParams } from 'react-router-dom';
import i18n from '../../i18n';
import { isSupportedUrlLang, urlLangToI18n } from '../../utils/localeRouting';
import NotFoundPage from '../../pages/error/NotFoundPage';

/**
 * Элемент родительского роута /:lang (docs/i18n-url-routing/spec.md §5).
 *
 * Невалидный :lang (не из SUPPORTED_URL_LANGS) → честный 404, без редиректа —
 * мусорный URL не должен зацикливаться, а не резолвиться в догадку.
 * Валидный :lang → синхронизирует рантайм i18next с URL (URL — источник истины
 * на время сессии, §1): changeLanguage (i18next сам пишет обратно в localStorage,
 * detection.caches уже настроен в i18n.ts — доп. кода не нужно) + document.lang
 * (сегодня захардкожен "en" в index.html и никогда не обновляется — существующий
 * дефект a11y/SEO, не только следствие локализации).
 */
export function LocaleLayout() {
  const { lang } = useParams<{ lang: string }>();
  const valid = isSupportedUrlLang(lang);

  useEffect(() => {
    if (!valid) return;
    const i18nLang = urlLangToI18n[lang];
    if (i18n.language !== i18nLang) {
      void i18n.changeLanguage(i18nLang);
    }
    document.documentElement.lang = i18nLang;
  }, [lang, valid]);

  if (!valid) {
    return <NotFoundPage />;
  }

  return <Outlet />;
}
