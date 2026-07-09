import { useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { DEFAULT_URL_LANG, buildLocalizedPath, isSupportedUrlLang } from '../utils/localeRouting';

/**
 * Резолвит текущий :lang из URL (фоллбэк на DEFAULT_URL_LANG вне /:lang-поддерева,
 * напр. NotFoundPage при невалидной локали) и возвращает функцию "канонический
 * путь приложения" → "путь браузера с языковым префиксом". Общая точка для
 * LocalizedLink/useLocalizedNavigate/PrivateRoute (docs/i18n-url-routing/spec.md §5).
 *
 * useCallback с зависимостью только от resolvedLang — возвращаемая функция должна
 * быть referentially stable, т.к. используется в navigate-обёртке, которую
 * ProfilePage.tsx кладёт в deps своего useEffect (redirect-guard при потере auth);
 * нестабильная ссылка пересоздавала бы эффект на каждый рендер.
 */
export function useLocalizedPath() {
  const { lang } = useParams<{ lang: string }>();
  const resolvedLang = isSupportedUrlLang(lang) ? lang : DEFAULT_URL_LANG;
  return useCallback((path: string) => buildLocalizedPath(resolvedLang, path), [resolvedLang]);
}
