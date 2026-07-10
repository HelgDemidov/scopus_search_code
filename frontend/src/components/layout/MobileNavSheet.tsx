import { useTranslation } from 'react-i18next';
import { Menu } from 'lucide-react';
import { LocalizedLink } from './LocalizedLink';
import { useLocalizedNavigate } from '../../hooks/useLocalizedNavigate';
import { useAuthStore } from '../../stores/authStore';
import { Button } from '../ui/button';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '../ui/sheet';
import { getInitials } from '../../utils/userDisplay';

// <sm бургер-меню (§4.3 ТЗ, docs/layout-overhaul/spec.md): дублирует
// навигацию/auth-действия правой группы плоской шапки, которая на <sm
// скрыта в Header.tsx (ThemeToggle/LanguageSwitcher из бургера убраны —
// теперь всегда видны в самой шапке, см. Header.tsx). Focus-trap
// и закрытие по Escape/клику вне — даёт сам Radix Dialog (через Sheet),
// отдельно не реализуются. Каждый пункт меню обёрнут в SheetClose asChild —
// закрывает Sheet при переходе по ссылке/выходе (composeEventHandlers
// в Radix вызывает и переданный onClick, и закрытие).
export function MobileNavSheet() {
  const { user, isAuthenticated, logout } = useAuthStore();
  const navigate = useLocalizedNavigate();
  const { t } = useTranslation();

  // Display name: username ?? part of email before @ (зеркало Header.tsx)
  const displayName = user
    ? (user.username ?? user.email.split('@')[0])
    : '';

  function handleLogout() {
    logout();
    navigate('/main');
  }

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('a11y.openMenu')}
          // ≥44×44 touch target (WCAG 2.2, §4.3 ТЗ) — sm:hidden здесь (не на
          // обёртке) держит саму кнопку вне DOM-показа ≥sm без лишнего <div>.
          // Скругленная квадратная рамка (border-2, rounded-lg от базового
          // Button) — единственный вход в полное меню на мобильном, должен
          // визуально выделяться сильнее пунктов внутри самого Sheet ниже.
          className="flex h-11 w-11 border-[1.5px] border-slate-400 dark:border-white sm:hidden"
        >
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>

      <SheetContent side="right" className="flex h-full w-72 flex-col overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{t('nav.menu')}</SheetTitle>
        </SheetHeader>

        {/* Пункты меню — та же скругленная рамка, что у бургер-иконки-триггера
            (визуальная связь "это всё внутри одного меню"), но тоньше
            (border, не border-2) и мягче по цвету — бургер остаётся
            заметнее как единственная точка входа снаружи Sheet. */}
        <nav aria-label={t('nav.menu')} className="flex flex-col gap-1 px-2">
          <SheetClose asChild>
            <LocalizedLink
              to="/search"
              className="flex h-11 items-center rounded-md border border-slate-200 px-3 text-sm font-medium hover:bg-muted dark:border-slate-600"
            >
              {t('nav.search')}
            </LocalizedLink>
          </SheetClose>

          <SheetClose asChild>
            <LocalizedLink
              to="/explore"
              className="flex h-11 items-center rounded-md border border-slate-200 px-3 text-sm font-medium hover:bg-muted dark:border-slate-600"
            >
              {t('nav.explore')}
            </LocalizedLink>
          </SheetClose>

          <SheetClose asChild>
            <LocalizedLink
              to="/about"
              className="flex h-11 items-center rounded-md border border-slate-200 px-3 text-sm font-medium hover:bg-muted dark:border-slate-600"
            >
              {t('nav.about')}
            </LocalizedLink>
          </SheetClose>

          {isAuthenticated && (
            <SheetClose asChild>
              <LocalizedLink
                to="/profile"
                className="flex h-11 items-center rounded-md border border-slate-200 px-3 text-sm font-medium hover:bg-muted dark:border-slate-600"
              >
                {t('nav.profile')}
              </LocalizedLink>
            </SheetClose>
          )}
        </nav>

        <div className="mt-auto flex flex-col gap-2 px-4 pb-4">
          {!isAuthenticated && (
            <SheetClose asChild>
              <Button
                asChild
                variant="default"
                size="lg"
                className="h-11 bg-blue-800 text-white hover:bg-blue-900 dark:bg-blue-500 dark:hover:bg-blue-400"
              >
                <LocalizedLink to="/auth">{t('nav.signIn')}</LocalizedLink>
              </Button>
            </SheetClose>
          )}

          {isAuthenticated && user && (
            <>
              <div className="flex items-center gap-2 px-1">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-800 text-xs font-semibold text-white dark:bg-blue-500">
                  {getInitials(displayName)}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                    {displayName}
                  </p>
                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                    {user.email}
                  </p>
                </div>
              </div>
              <SheetClose asChild>
                <button
                  onClick={handleLogout}
                  className="flex h-11 items-center rounded-md px-3 text-left text-sm font-medium text-rose-600 hover:bg-muted dark:text-rose-400"
                >
                  {t('nav.signOut')}
                </button>
              </SheetClose>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
