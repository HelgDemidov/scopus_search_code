// ---------------------------------------------------------------------------
// Конфигурация маршрутов — вынесена из App.tsx в отдельный файл, чтобы
// именованный экспорт appRoutes (данные, не компонент) не ломал
// react-refresh/only-export-components (правило требует, чтобы файл
// экспортировал только компоненты) и не триггерил --max-warnings 0 в CI.
// ---------------------------------------------------------------------------

import { lazy, Suspense, useEffect } from 'react';
import { createBrowserRouter, Navigate, Outlet as RouterOutlet, useLocation } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import type { RouteObject } from 'react-router-dom';
import { Header } from './components/layout/Header';
import { PrivateRoute } from './components/layout/PrivateRoute';
import { LocaleLayout } from './components/layout/LocaleLayout';
import { recordBreadcrumb } from './utils/errorReport';
import { DEFAULT_URL_LANG, buildLocalizedPath } from './utils/localeRouting';
import { useLocalizedPath } from './hooks/useLocalizedPath';
import { useDefaultLandingPath } from './hooks/useDefaultLandingPath';
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
// Экспортирован (не только для appRoutes) — тестируется отдельно в
// router.rootLayoutSeo.test.tsx (fallback/override Helmet-тегов).
export function RootLayout() {
  const location = useLocation();

  useEffect(() => {
    if (typeof window.gtag === 'function') {
      window.gtag('event', 'page_view', { page_path: location.pathname + location.search });
    }
    // Breadcrumb для "Report this issue" на error-страницах (docs/error-experience/spec.md)
    recordBreadcrumb(location.pathname + location.search);
  }, [location]);

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background text-foreground">
      {/* Дефолтный Helmet — постоянно смонтирован (RootLayout не размонтируется между
          роутами), фолбэк title/description/canonical для страниц БЕЗ своего useHreflangTags
          (auth/profile/article/:id/error-страницы — вне 6 индексируемых секций §6 ТЗ).
          Без этого при переходе с "wired" страницы (напр. /about) на "unwired" (напр. /auth)
          title/description/canonical оставались от предыдущей страницы или пропадали вовсе —
          react-helmet-async снимает свои теги при unmount активного <Helmet>-инстанса, а
          других (у /auth) не было, кому их восстановить. Проверено вручную (Chrome DevTools):
          react-helmet-async корректно дедуплицирует "innermost wins" даже для
          rel="canonical" — вложенный per-page Helmet чисто переопределяет этот дефолт,
          дублей не возникает. Значения — те же, что статичные в index.html (см. комментарий
          там же про data-rh="true" — без этого маркера Helmet не видит статичные теги и
          дублирует их вместо замены). */}
      <Helmet>
        <title>Scopus Research Search</title>
        <meta name="description" content="AI research publications from Scopus, curated and searchable" />
        <link rel="canonical" href="https://scopus-search-code.vercel.app/" />
      </Helmet>
      <Header />
      {/* flex-1 — <main> заполняет ровно оставшуюся высоту (100dvh минус
          РЕАЛЬНАЯ высота Header), а не хардкоженную "3.5rem": высота Header
          не константа (border-b 1px + env(safe-area-inset-top) на notched
          устройствах) — calc(100vh-3.5rem) на страницах (было в SearchPage/
          AuthPage) систематически недосчитывал 1px+ и создавал паразитный
          скролл даже когда контента меньше вьюпорта (найдено 2026-07-10). */}
      <main className="flex-1">
        <RouterOutlet />
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Редиректы для локализованной URL-архитектуры (docs/i18n-url-routing/spec.md §5)
// ---------------------------------------------------------------------------

// Общая role-based (анон → /main, авторизован → /search) index-редирект-цель —
// используется и на голом '/' (вне /:lang-поддерева), и на голом '/:lang'
// (ручной ввод без секции). useLocalizedPath сама решает лингвистический
// фоллбэк в обоих случаях (вне /:lang — уже инициализированный i18next;
// внутри — сам :lang, валидность гарантирована LocaleLayout-родителем).
// Не листится в sitemap.xml (§6 ТЗ) — редиректор, не контент.
export function LangIndexRedirect() {
  const resolve = useLocalizedPath();
  const landingPath = useDefaultLandingPath();
  return <Navigate to={resolve(landingPath)} replace />;
}

// Алиас для голого '/' — тот же компонент, отдельное имя отражает
// семантически другую позицию в дереве роутов (вне /:lang, а не его index).
export const RootRedirect = LangIndexRedirect;

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
const AboutPage           = lazyPage(() => import('./pages/AboutPage'));
const ExplorePage         = lazyPage(() => import('./pages/ExplorePage'));
const AuthPage            = lazyPage(() => import('./pages/AuthPage'));
const OAuthCallback       = lazyPage(() => import('./pages/OAuthCallback'));
const ProfilePage         = lazyPage(() => import('./pages/ProfilePage'));
const ArticlePage         = lazyPage(() => import('./pages/ArticlePage'));
const ForgotPasswordPage  = lazyPage(() => import('./pages/ForgotPasswordPage'));
const ResetPasswordPage   = lazyPage(() => import('./pages/ResetPasswordPage'));
const PrivacyPage         = lazyPage(() => import('./pages/PrivacyPage'));
const TermsPage           = lazyPage(() => import('./pages/TermsPage'));

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
              { path: 'about',         element: AboutPage },
              { path: 'privacy',       element: PrivacyPage },
              { path: 'terms',         element: TermsPage },
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
