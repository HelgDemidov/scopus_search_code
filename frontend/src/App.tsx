// ---------------------------------------------------------------------------
// Импорты — все в начале файла (ESLint import/first)
// ---------------------------------------------------------------------------

import { lazy, Suspense, useEffect } from 'react';
import { RouterProvider, createBrowserRouter, Outlet as RouterOutlet } from 'react-router-dom';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { Toaster } from './components/ui/sonner';
import { Header } from './components/layout/Header';
import { PrivateRoute } from './components/layout/PrivateRoute';
import { useAuthStore } from './stores/authStore';
import { useStatsStore } from './stores/statsStore';

// ---------------------------------------------------------------------------
// Вспомогательные компоненты — объявляются до первого использования
// ---------------------------------------------------------------------------

// Заглушка при ленивой загрузке страницы (используется внутри lazyPage)
function PageFallback() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-800 dark:border-slate-700 dark:border-t-blue-500" />
    </div>
  );
}

// Обёртка для ленивой загрузки страниц — code splitting через React.lazy + Suspense
function lazyPage(factory: () => Promise<{ default: React.ComponentType }>) {
  const Component = lazy(factory);
  return (
    <Suspense fallback={<PageFallback />}>
      <Component />
    </Suspense>
  );
}

// Общий шаблон страницы: Header сверху + содержимое через Outlet
function RootLayout() {
  return (
    <div className="min-h-screen bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-100">
      <Header />
      <main>
        <RouterOutlet />
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ленивые страницы — объявляются после lazyPage (нет зависимости от hoisting)
// ---------------------------------------------------------------------------

const HomePage      = lazyPage(() => import('./pages/HomePage'));
const ExplorePage   = lazyPage(() => import('./pages/ExplorePage'));
const AuthPage      = lazyPage(() => import('./pages/AuthPage'));
const OAuthCallback = lazyPage(() => import('./pages/OAuthCallback'));
const ProfilePage   = lazyPage(() => import('./pages/ProfilePage'));
// Страница деталей статьи — публичная, не требует авторизации
const ArticlePage   = lazyPage(() => import('./pages/ArticlePage'));

// ---------------------------------------------------------------------------
// Маршруты по §3 ТЗ
// ---------------------------------------------------------------------------

const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    children: [
      { index: true,           element: HomePage },
      { path: 'explore',       element: ExplorePage },
      { path: 'auth',          element: AuthPage },
      { path: 'auth/callback', element: OAuthCallback },
      // Страница статьи — публичная, доступна без авторизации
      { path: 'article/:id',   element: ArticlePage },
      {
        // Защищённые маршруты через PrivateRoute
        element: <PrivateRoute />,
        children: [
          { path: 'profile', element: ProfilePage },
        ],
      },
    ],
  },
]);

// ---------------------------------------------------------------------------
// Корневой компонент приложения
// ---------------------------------------------------------------------------

export default function App() {
  const { setToken, fetchUser } = useAuthStore();
  const fetchStats = useStatsStore((state) => state.fetchStats);

  useEffect(() => {
    // Hydration токена из localStorage без немедленной валидации (§4.3)
    // Токен будет проверен при первом приватном запросе GET /users/me;
    // если истёк — axios interceptor попытается silent refresh через RT cookie
    const token = localStorage.getItem('access_token');
    if (token) {
      setToken(token);
      // Загружаем профиль сразу — чтобы Header отобразил имя
      fetchUser();
    }

    // Слушаем событие от interceptor — обновляем AT в сторе без прямой зависимости.
    // После silent refresh вызываем fetchUser() повторно: fetchUser(), завершившийся
    // с catch{} до refresh, не перезапускается автоматически — без этого authStore.user
    // остаётся null и ProfilePage зависает на skeleton бесконечно.
    const handleTokenRefresh = (e: Event) => {
      const newToken = (e as CustomEvent<string>).detail;
      if (newToken) {
        setToken(newToken);
        fetchUser();
      }
    };
    window.addEventListener('auth:token-refreshed', handleTokenRefresh);

    // Предзагружаем статистику: она нужна и /explore, и sidebar фильтров главной
    fetchStats();

    return () => {
      window.removeEventListener('auth:token-refreshed', handleTokenRefresh);
    };
  }, []);

  return (
    <>
      <RouterProvider router={router} />
      {/* Глобальный контейнер для toast-уведомлений через shadcn Sonner */}
      <Toaster richColors position="top-right" />
      <Analytics />
      <SpeedInsights />
    </>
  );
}
