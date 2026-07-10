import { useTranslation } from 'react-i18next';
import { ThemeToggle } from '../theme/ThemeToggle';
import { LanguageSwitcher } from './LanguageSwitcher';
import { LocalizedLink } from './LocalizedLink';
import { useLocalizedNavigate } from '../../hooks/useLocalizedNavigate';
import { useDefaultLandingPath } from '../../hooks/useDefaultLandingPath';
import { useArticleStore } from '../../stores/articleStore';
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuList,
  NavigationMenuLink,
  navigationMenuTriggerStyle,
} from '../ui/navigation-menu';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { Button } from '../ui/button';
import { useAuthStore } from '../../stores/authStore';
import { MobileNavSheet } from './MobileNavSheet';
import { getInitials } from '../../utils/userDisplay';

export function Header() {
  const { user, isAuthenticated, logout } = useAuthStore();
  const navigate = useLocalizedNavigate();
  const resetSearch = useArticleStore((s) => s.resetSearch);
  const { t } = useTranslation();
  // Логотип — role-based цель (§4.1 ТЗ): /main для анонимных, /search для
  // авторизованных, вместо голого '/' (лишний прыжок через RootRedirect)
  const landingPath = useDefaultLandingPath();

  // Display name: username ?? part of email before @
  const displayName = user
    ? (user.username ?? user.email.split('@')[0])
    : '';

  // Sign out: clear store, redirect to /main (после logout isAuthenticated=false)
  function handleLogout() {
    logout();
    navigate('/main');
  }

  return (
    <header
      // Safe-area: env(safe-area-inset-*) — следствие viewport-fit=cover (§4.1
      // ТЗ, docs/layout-overhaul/spec.md); без этого паддинга шапка на notched-
      // устройствах (особенно landscape) уходит под жестовую зону/чёлку. На
      // не-notched устройствах env(...) резолвится в 0 — поведение не меняется.
      className="sticky top-0 z-50 w-full border-b border-slate-200 bg-white/95 pt-[env(safe-area-inset-top)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] backdrop-blur dark:border-slate-700 dark:bg-[#0c1927]/95"
    >
      <div className="mx-auto flex h-14 max-w-screen-xl items-center justify-between px-4">
        {/* Logo — aria-label kept in English per spec §1.6 */}
        <LocalizedLink
          to={landingPath}
          onClick={resetSearch}
          className="flex items-center gap-2 text-slate-900 no-underline dark:text-slate-100"
        >
          {/* Inline SVG logo */}
          <svg
            aria-label="Scopus Search"
            viewBox="0 0 32 32"
            fill="none"
            className="h-7 w-7"
          >
            <circle cx="16" cy="16" r="14" stroke="currentColor" strokeWidth="2" className="text-blue-800 dark:text-blue-500" />
            <circle cx="16" cy="16" r="6" fill="currentColor" className="text-blue-800 dark:text-blue-500" />
            <line x1="22" y1="22" x2="28" y2="28" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-blue-800 dark:text-blue-500" />
          </svg>
          <span className="font-semibold text-sm tracking-tight">Scopus Search</span>
        </LocalizedLink>

        {/* Navigation + right-side controls — скрыто <sm (§4.3 ТЗ,
            docs/layout-overhaul/spec.md): замеры показали, что вся эта
            группа не влезает на узких экранах (RU-шапка ≈353px). Дублируется
            в MobileNavSheet (бургер справа, ниже) для <sm. */}
        <div className="hidden items-center gap-2 sm:flex">
          <ThemeToggle />
          <LanguageSwitcher />
          <NavigationMenu>
            <NavigationMenuList>
              {/* "Search" link — always visible (docs/i18n-url-routing/spec.md §4.1:
                  раньше поиск был достижим только через логотип/'/') */}
              <NavigationMenuItem>
                <NavigationMenuLink asChild className={navigationMenuTriggerStyle()}>
                  <LocalizedLink to="/search">{t('nav.search')}</LocalizedLink>
                </NavigationMenuLink>
              </NavigationMenuItem>

              {/* "Explore" link — always visible */}
              <NavigationMenuItem>
                <NavigationMenuLink asChild className={navigationMenuTriggerStyle()}>
                  <LocalizedLink to="/explore">{t('nav.explore')}</LocalizedLink>
                </NavigationMenuLink>
              </NavigationMenuItem>

              {/* "About" link — always visible (docs/i18n-url-routing/spec.md §4.2) */}
              <NavigationMenuItem>
                <NavigationMenuLink asChild className={navigationMenuTriggerStyle()}>
                  <LocalizedLink to="/about">{t('nav.about')}</LocalizedLink>
                </NavigationMenuLink>
              </NavigationMenuItem>

              {/* "Profile" nav-ссылка убрана для авторизованных (дублировала пункт
                  "Profile" в дропдауне аватара ниже — доступ к профилю остаётся
                  через аватар, как везде в остальном UI). Mobile-меню (бургер)
                  сохраняет отдельную ссылку — там нет кликабельного аватара. */}
            </NavigationMenuList>
          </NavigationMenu>

          {/* Anonymous state: "Sign in" button */}
          {!isAuthenticated && (
            <Button
              asChild
              variant="default"
              size="lg"
              // text-white + rounded-md переопределяют дефолт shadcn Button
              // (text-primary-foreground в тёмной теме — почти чёрный, см. index.css
              // --primary-foreground; rounded-lg) — тот же вид, что у CTA-баннера
              // "Sign in" в ExplorePage.tsx, единообразно по всему сайту.
              // size="lg" (h-9, text-sm) вместо "sm" (h-7, text-[0.8rem]) — совпадает
              // с navigationMenuTriggerStyle() соседней ссылки "Explore" по высоте и
              // размеру шрифта, обе надписи на одном горизонтальном уровне.
              className="bg-blue-800 hover:bg-blue-900 dark:bg-blue-500 dark:hover:bg-blue-400 text-white rounded-md"
            >
              <LocalizedLink to="/auth">{t('nav.signIn')}</LocalizedLink>
            </Button>
          )}

          {/* Authenticated state: avatar + dropdown */}
          {isAuthenticated && user && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  aria-label={t('a11y.userMenu', { name: displayName })}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-800 text-xs font-semibold text-white hover:bg-blue-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-800 dark:bg-blue-500 dark:hover:bg-blue-400"
                >
                  {getInitials(displayName)}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {/* Name and email — read-only display */}
                <div className="px-2 py-1.5">
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    {displayName}
                  </p>
                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                    {user.email}
                  </p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <LocalizedLink to="/profile">{t('nav.profile')}</LocalizedLink>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleLogout}
                  className="text-rose-600 focus:text-rose-600 dark:text-rose-400"
                >
                  {t('nav.signOut')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* Бургер — виден только <sm (кнопка сама скрывается через sm:hidden
            в MobileNavSheet), т.к. группа выше скрыта тем же брейкпоинтом. */}
        <MobileNavSheet />
      </div>
    </header>
  );
}
