// ---------------------------------------------------------------------------
// Импорты — все в начале файла (ESLint import/first)
// ---------------------------------------------------------------------------

import { useEffect } from 'react';
import { RouterProvider } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { useTranslation } from 'react-i18next';
import { Toaster } from './components/ui/sonner';
import { ThemeProvider } from './components/theme/ThemeProvider';
import { StarFieldCanvas } from './components/theme/StarFieldCanvas';
import { useAuthStore } from './stores/authStore';
import { useStatsStore } from './stores/statsStore';
import { router } from './router';

// ---------------------------------------------------------------------------
// Модульный флаг — защита от двойного запуска гидрации
// ---------------------------------------------------------------------------

// Объявлен вне компонента: переживает двойной вызов useEffect в React StrictMode
// (Strict Mode намеренно монтирует → размонтирует → монтирует заново в dev)
// и повторное монтирование при hot-reload.
// Гарантирует ровно один POST /auth/refresh за жизненный цикл страницы.
let _hydrationStarted = false;

// ---------------------------------------------------------------------------
// Корневой компонент приложения
// ---------------------------------------------------------------------------

export default function App() {
  const { setToken, fetchUser, logout, setHydrating } = useAuthStore();
  const fetchStats = useStatsStore((state) => state.fetchStats);
  const { i18n } = useTranslation();

  // Синхронизируем атрибут lang на <html> при смене языка — важно для скринридеров
  useEffect(() => {
    document.documentElement.lang = i18n.language;
  }, [i18n.language]);

  useEffect(() => {
    // Guard против двойного вызова useEffect (StrictMode, hot-reload)
    if (_hydrationStarted) return;
    _hydrationStarted = true;

    // Условный silent refresh:
    // если мы на /auth/callback — OAuthCallback.tsx управляет сессией
    // и сам вызовет setHydrating(false). Повторный refresh ротировал бы RT
    // преждевременно и создавал race condition с fetchUser.
    const isOAuthCallbackRoute = window.location.pathname === '/auth/callback';

    if (!isOAuthCallbackRoute) {
      // Нормальный старт: делаем silent refresh — единственный способ проверить
      // валидность сессии: RT cookie отправляется браузером автоматически.
      // Динамический импорт разрывает циклическую зависимость
      //   App.tsx → api/auth → client.ts → authStore → App.tsx
      import('./api/auth').then(({ refreshAccessToken }) =>
        refreshAccessToken()
          .then((newToken) => {
            setToken(newToken);
            fetchUser();
          })
          .catch(() => {
            // RT отсутствует или истек — очищаем устаревший AT из localStorage
            localStorage.removeItem('access_token');
          })
          .finally(() => {
            setHydrating(false);
          }),
      );
    }
    // Если isOAuthCallbackRoute === true: OAuthCallback.tsx управляет гидрацией самостоятельно,
    // вызывая setHydrating(false) после fetchUser — нам здесь ничего делаться.

    // Слушаем успешный silent refresh от response interceptor.
    // fetchUser вызывается только если user === null — предотвращает гонку
    // состояний при RT-ротации mid-session: без этого guard'а повторный
    // GET /users/me запускал второй POST /auth/refresh через interceptor,
    // что роняло страницы /profile и /explore.
    const handleTokenRefresh = (e: Event) => {
      const newToken = (e as CustomEvent<string>).detail;
      if (newToken) {
        setToken(newToken);
        // Загружаем user только если он еще не был загружен —
        // в нормальном mid-session сценарии user уже присутствует в сторе
        if (!useAuthStore.getState().user) {
          fetchUser();
        }
      }
    };
    window.addEventListener('auth:token-refreshed', handleTokenRefresh);

    // Слушаем принудительный logout от response interceptor (RT истек mid-session).
    // logout() очищает стор + localStorage → isAuthenticated: false →
    // PrivateRoute редиректит на /auth через React Router без hard reload
    const handleLogoutRequired = () => { logout(); };
    window.addEventListener('auth:logout-required', handleLogoutRequired);

    // Предзагружаем статистику: она нужна и /explore, и sidebar фильтров главной
    fetchStats();

    return () => {
      window.removeEventListener('auth:token-refreshed', handleTokenRefresh);
      window.removeEventListener('auth:logout-required', handleLogoutRequired);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <HelmetProvider>
      <ThemeProvider>
        <StarFieldCanvas />
        <RouterProvider router={router} />
        {/* Глобальный контейнер для toast-уведомлений через shadcn Sonner */}
        <Toaster richColors position="top-right" />
        <Analytics />
        <SpeedInsights />
      </ThemeProvider>
    </HelmetProvider>
  );
}
