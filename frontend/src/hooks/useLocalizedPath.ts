import { useCallback } from 'react';
import { useParams } from 'react-router-dom';
import i18n from '../i18n';
import { DEFAULT_URL_LANG, buildLocalizedPath, i18nToUrlLang, isSupportedUrlLang } from '../utils/localeRouting';

/**
 * Резолвит текущий :lang из URL и возвращает функцию "канонический путь
 * приложения" → "путь браузера с языковым префиксом". Общая точка для
 * LocalizedLink/useLocalizedNavigate/PrivateRoute (docs/i18n-url-routing/spec.md §5).
 *
 * Фоллбэк вне /:lang-поддерева — уже определившийся язык i18next (localStorage/
 * navigator), не жёстко DEFAULT_URL_LANG: используется на 2 исключённых из схемы
 * страницах (§7 — /auth/callback, /reset-password), где ссылка "назад к /auth"
 * не должна сбрасывать пользователя на английский, если он весь визит работал
 * на русском. (Отдельно от этого — LegacyPathRedirect для legacy bare-путей
 * намеренно жёстко бьёт в DEFAULT_URL_LANG, простой детерминированный мост для
 * старых проиндексированных ссылок, а не UX-непрерывность текущей сессии.)
 *
 * useCallback с зависимостью только от resolvedLang — возвращаемая функция должна
 * быть referentially stable, т.к. используется в navigate-обёртке, которую
 * ProfilePage.tsx кладёт в deps своего useEffect (redirect-guard при потере auth);
 * нестабильная ссылка пересоздавала бы эффект на каждый рендер.
 */
export function useLocalizedPath() {
  const { lang } = useParams<{ lang: string }>();
  const resolvedLang = isSupportedUrlLang(lang) ? lang : (i18nToUrlLang[i18n.language] ?? DEFAULT_URL_LANG);
  return useCallback((path: string) => buildLocalizedPath(resolvedLang, path), [resolvedLang]);
}
