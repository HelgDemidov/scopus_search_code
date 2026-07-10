import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { NavigateOptions } from 'react-router-dom';
import { useLocalizedPath } from './useLocalizedPath';

/** Обёртка над useNavigate(), автоматически подставляющая текущий языковой
 * префикс (docs/i18n-url-routing/spec.md §5). Возвращаемая функция stable
 * (см. useLocalizedPath) — безопасна в deps существующих useEffect (ProfilePage.tsx). */
export function useLocalizedNavigate() {
  const navigate = useNavigate();
  const resolve = useLocalizedPath();
  return useCallback(
    (path: string, options?: NavigateOptions) =>
      options === undefined ? navigate(resolve(path)) : navigate(resolve(path), options),
    [navigate, resolve],
  );
}
