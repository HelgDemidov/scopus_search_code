// ---------------------------------------------------------------------------
// Конфигурация маршрутов — вынесена из App.tsx в отдельный файл, чтобы
// именованный экспорт appRoutes (данные, не компонент) не ломал
// react-refresh/only-export-components (правило требует, чтобы файл
// экспортировал только компоненты) и не триггерил --max-warnings 0 в CI.
// ---------------------------------------------------------------------------

import { lazy, Suspense, useEffect } from 'react';
import { createBrowserRouter, Navigate, Outlet as RouterOutlet, useLocation } from 'react-router-dom';
import type { RouteObject } from 'react-router-dom';
import { Header } from './components/layout/Header';
import { PrivateRoute } from './components/layout/PrivateRoute';
import { LocaleLayout } from './components/layout/LocaleLayout';
import { recordBreadcrumb } from './utils/errorReport';
import { DEFAULT_URL_LANG, buildLocalizedPath, i18nToUrlLang } from './utils/localeRouting';
import { useLocalizedPath } from './hooks/useLocalizedPath';
import { useDefaultLandingPath } from './hooks/useDefaultLandingPath';
import i18n from './i18n';
import NotFoundPage from './pages/error/NotFoundPage';
import RouteErrorPage from './pages/error/RouteErrorPage';

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

// Общий шаблон страницы: Header сверху + содержимое через Outlet.
// useLocation доступен здесь, т.к. RootLayout рендерится внутри RouterProvider.
function RootLayout() {
  const location = useLocation();

  useEffect(() => {
    if (typeof window.gtag === 'function') {
      window.gtag('event', 'page_view', { page_path: location.pathname + location.search });
    }
    // Breadcrumb для "Report this issue" на error-страницах (docs/error-experience/spec.md)
    recordBreadcrumb(location.pathname + location.search);
  }, [location]);

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <Header />
      <main>
        <RouterOutlet />
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Редиректы для локализованной URL-архитектуры (docs/i18n-url-routing/spec.md §5)
// ---------------------------------------------------------------------------

// Голый '/' (вне /:lang-поддерева) — детектит язык из уже инициализированного
// i18next (LanguageDetector отработал синхронно при импорте ./i18n в main.tsx,
// до первого рендера) и роль (анон/авторизован), редиректит одним прыжком на
// реальный локализованный лендинг. Не листится в sitemap.xml (§6 ТЗ) —
// редиректор, не контент.
export function RootRedirect() {
  const landingPath = useDefaultLandingPath();
  const urlLang = i18nToUrlLang[i18n.language] ?? DEFAULT_URL_LANG;
  return <Navigate to={buildLocalizedPath(urlLang, landingPath)} replace />;
}

// Голый '/:lang' (ручной ввод без секции) — та же роль-based цель, но lang уже
// известен из URL (валидность гарантирована LocaleLayout-родителем).
export function LangIndexRedirect() {
  const resolve = useLocalizedPath();
  const landingPath = useDefaultLandingPath();
  return <Navigate to={resolve(landingPath)} replace />;
}

// Legacy bare-пути (были проиндексированы Google до этого ТЗ — /explore,
// /auth, /profile, /article/:id, /forgot-password, §3 ТЗ) — client-side
// фоллбэк для npm run dev (Vite dev-сервер не читает vercel.json). В проде
// эти же 5 путей ловятся раньше, на edge, статическим redirects в
// vercel.json (308) — не долетают до этого компонента вовсе. Один общий
// компонент для всех 5: location.pathname уже содержит резолвленные
// значения динамических сегментов (напр. /article/123), buildLocalizedPath
// просто добавляет префикс — не нужен redirect на каждый путь отдельно.
export function LegacyPathRedirect() {
  const location = useLocation();
  return (
    <Navigate to={buildLocalizedPath(DEFAULT_URL_LANG, location.pathname) + location.search} replace />
  );
}

// ---------------------------------------------------------------------------
// Ленивые страницы — объявляются после lazyPage (нет зависимости от hoisting)
// ---------------------------------------------------------------------------

const MainPage            = lazyPage(() => import('./pages/MainPage'));
const SearchPage          = lazyPage(() => import('./pages/SearchPage'));
const ExplorePage         = lazyPage(() => import('./pages/ExplorePage'));
const AuthPage            = lazyPage(() => import('./pages/AuthPage'));
const OAuthCallback       = lazyPage(() => import('./pages/OAuthCallback'));
const ProfilePage         = lazyPage(() => import('./pages/ProfilePage'));
const ArticlePage         = lazyPage(() => import('./pages/ArticlePage'));
const ForgotPasswordPage  = lazyPage(() => import('./pages/ForgotPasswordPage'));
const ResetPasswordPage   = lazyPage(() => import('./pages/ResetPasswordPage'));

// ---------------------------------------------------------------------------
// Маршруты по §3 ТЗ
// ---------------------------------------------------------------------------

// Единственный источник истины для тестов, проверяющих, что Link'и
// (например ArticleCard → /article/:id) действительно резолвятся
// в зарегистрированный маршрут (см. ArticleCard.test.tsx).
export const appRoutes: RouteObject[] = [
  {
    path: '/',
    element: <RootLayout />,
    children: [
      {
        // errorElement — на ВЛОЖЕННОМ безпутевом (pathless) роуте, не на
        // родительском '/' — известная особенность react-router: при краше
        // errorElement заменяет элемент ТОГО ЖЕ роута целиком, т.е. на
        // родительском роуте это стёрло бы RootLayout вместе с Header
        // (RouteErrorPage рендерился бы «голым», без шапки сайта). На
        // вложенном pathless-роуте errorElement подменяет только Outlet
        // внутри RootLayout — Header остаётся смонтирован при краше.
        // Ловит непойманные исключения из loader/action/render дочерних
        // роутов (docs/error-experience/spec.md) — 404 обрабатывается
        // ОТДЕЛЬНЫМ path:'*' роутом ниже, не через errorElement: «такой
        // страницы нет» семантически не «ошибка».
        errorElement: <RouteErrorPage />,
        children: [
          { index: true, element: <RootRedirect /> },

          // Исключения из локализации (docs/i18n-url-routing/spec.md §7) — бэкенд
          // хардкодит эти 2 URL без понятия о локали (app/routers/auth.py:112,187:
          // OAuth-редирект и ссылка в письме password-reset от Brevo). Остаются
          // без /{lang}-префикса навсегда, не только на переходный период.
          { path: 'auth/callback',   element: OAuthCallback },
          { path: 'reset-password',  element: ResetPasswordPage },

          // Legacy bare-пути — уже проиндексированы Google (§3 ТЗ), редирект на
          // /en/... (client-side фоллбэк; прод — vercel.json redirects, см. §3).
          // Статические литералы 'explore'/'auth'/'profile'/... ранжируются
          // react-router выше динамического ':lang' ниже — коллизии нет.
          { path: 'explore',         element: <LegacyPathRedirect /> },
          { path: 'auth',            element: <LegacyPathRedirect /> },
          { path: 'profile',         element: <LegacyPathRedirect /> },
          { path: 'article/:id',     element: <LegacyPathRedirect /> },
          { path: 'forgot-password', element: <LegacyPathRedirect /> },

          {
            path: ':lang',
            element: <LocaleLayout />,
            children: [
              { index: true,           element: <LangIndexRedirect /> },
              { path: 'main',          element: MainPage },
              { path: 'search',        element: SearchPage },
              { path: 'explore',       element: ExplorePage },
              { path: 'article/:id',   element: ArticlePage },
              { path: 'auth',          element: AuthPage },
              { path: 'forgot-password', element: ForgotPasswordPage },
              {
                // Защищенные маршруты через PrivateRoute
                element: <PrivateRoute />,
                children: [
                  { path: 'profile', element: ProfilePage },
                ],
              },
              { path: '*', element: <NotFoundPage /> },
            ],
          },
        ],
      },
    ],
  },
];

export const router = createBrowserRouter(appRoutes);
