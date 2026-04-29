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
  const { setToken, fetchUser, logout, setHydrating } = useAuthStore();
  const fetchStats = useStatsStore((state) => state.fetchStats);

  useEffect(() => {
    // Однократная очистка legacy-записи 'access_token' из localStorage.
    // После Commit 3 AT хранится только в памяти; у существующих пользователей
    // после деплоя могла остаться старая запись — удаляем её при первом запуске.
    localStorage.removeItem('access_token');

    // Silent refresh при старте — единственный авторитетный способ проверить
    // валидность сессии: RT cookie отправляется браузером автоматически.
    // Успех: получаем свежий AT → setToken обновляет стор в памяти.
    // Провал: RT истёк/отозван → стор остаётся isAuthenticated: false;
    //   setHydrating(false) позволит PrivateRoute принять решение о редиректе.
    // Динамический импорт разрывает циклическую зависимость:
    //   App.tsx → api/auth → client.ts → authStore → App.tsx
    import('./api/auth').then(({ refreshAccessToken }) =>
      refreshAccessToken()
        .then((newToken) => {
          // Успешный refresh — обновляем AT в памяти и загружаем профиль
          setToken(newToken);
          fetchUser();
        })
        .catch(() => {
          // RT отсутствует или истёк — стор уже isAuthenticated: false,
          // ничего дополнительно делать не нужно
        })
        .finally(() => {
          // Гидрация завершена в любом случае — PrivateRoute может принимать решения
          setHydrating(false);
        }),
    );

    // Слушаем успешный silent refresh из response interceptor.
    // Вызываем setToken + fetchUser: без этого authStore.user остаётся null
    // и ProfilePage бесконечно показывает skeleton после истечения AT mid-session.
    const handleTokenRefresh = (e: Event) => {
      const newToken = (e as CustomEvent<string>).detail;
      if (newToken) {
        setToken(newToken);
        fetchUser();
      }
    };
    window.addEventListener('auth:token-refreshed', handleTokenRefresh);

    // Слушаем принудительный logout от response interceptor (RT истёк mid-session).
    // logout() очищает стор → isAuthenticated: false → PrivateRoute редиректит на /auth
    // через React Router без hard reload страницы.
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
    <>
      <RouterProvider router={router} />
      {/* Глобальный контейнер для toast-уведомлений через shadcn Sonner */}
      <Toaster richColors position="top-right" />
      <Analytics />
      <SpeedInsights />
    </>
  );
}
