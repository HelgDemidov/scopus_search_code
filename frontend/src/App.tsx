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

// Обертка для ленивой загрузки страниц — code splitting через React.lazy + Suspense.
//
// Фикс: перехватываем TypeError «Failed to fetch dynamically imported module» —
// браузерный признак stale-chunk после нового деплоя на Vercel/CDN.
// Новый деплой меняет хэши чанков; браузер со старым index.html пытается
// загрузить уже несуществующий файл и получает HTML 404 с MIME text/html —
// строгая MIME-проверка модульных скриптов отказывает в исполнении.
// window.location.reload() загружает свежий index.html с актуальными хэшами.
function lazyPage(factory: () => Promise<{ default: React.ComponentType }>) {
  const safeFactory = () =>
    factory().catch((err: unknown) => {
      // Stale-chunk: CDN вернул HTML вместо JS после нового деплоя
      if (
        err instanceof TypeError &&
        err.message.includes('Failed to fetch dynamically imported module')
      ) {
        window.location.reload();
      }
      // Остальные ошибки (сетевые, синтаксические) пробрасываем дальше —
      // React Router ErrorBoundary покажет понятный экран ошибки
      return Promise.reject(err);
    });

  const Component = lazy(safeFactory);
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
        // Защищенные маршруты через PrivateRoute
        element: <PrivateRoute />,
        children: [
          { path: 'profile', element: ProfilePage },
        ],
      },
    ],
  },
]);

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

  useEffect(() => {
    // Guard против двойного вызова useEffect (StrictMode, hot-reload)
    if (_hydrationStarted) return;
    _hydrationStarted = true;

    // Фаст-путь: синхронная гидрация из localStorage.
    // Позволяет Header немедленно отобразить имя пользователя при перезагрузке.
    const token = localStorage.getItem('access_token');
    if (token) {
      setToken(token);
      fetchUser();
    }

    // Условный silent refresh (Commit 4):
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
    <>
      <RouterProvider router={router} />
      {/* Глобальный контейнер для toast-уведомлений через shadcn Sonner */}
      <Toaster richColors position="top-right" />
      <Analytics />
      <SpeedInsights />
    </>
  );
}
