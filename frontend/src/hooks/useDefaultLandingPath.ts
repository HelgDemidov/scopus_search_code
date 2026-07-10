import { useAuthStore } from '../stores/authStore';

/** '/search' для авторизованных, '/main' для анонимных — единая role-based цель
 * "домашней" навигации (клик по логотипу, редирект с голого / и с голого /:lang).
 * Один источник правды вместо дублирования условия в RootRedirect и LangIndexRedirect
 * (docs/i18n-url-routing/spec.md §5). */
export function useDefaultLandingPath(): '/search' | '/main' {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return isAuthenticated ? '/search' : '/main';
}
