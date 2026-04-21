import { Link, useNavigate } from 'react-router-dom';
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

// Генерация двух буквенных инициалов для аватара
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Header() {
  const { user, isAuthenticated, logout } = useAuthStore();
  const navigate = useNavigate();

  // Имя для отображения: username ?? часть email до @
  const displayName = user
    ? (user.username ?? user.email.split('@')[0])
    : '';

  // Выход из аккаунта: чистим стор, редирект на главную
  function handleLogout() {
    logout();
    navigate('/');
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-200 bg-white/95 backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
      <div className="mx-auto flex h-14 max-w-screen-xl items-center justify-between px-4">
        {/* Логотип — aria-label сохраняем на английском (исключение по ТЗ §1.6) */}
        <Link
          to="/"
          className="flex items-center gap-2 text-slate-900 no-underline dark:text-slate-100"
        >
          {/* Инлайн SVG-логотип */}
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
        </Link>

        {/* Навигация + правая часть */}
        <div className="flex items-center gap-2">
          <NavigationMenu>
            <NavigationMenuList>
              {/* Ссылка «Исследовать» — всегда видна */}
              <NavigationMenuItem>
                <NavigationMenuLink asChild className={navigationMenuTriggerStyle()}>
                  <Link to="/explore">Исследовать</Link>
                </NavigationMenuLink>
              </NavigationMenuItem>

              {/* Ссылка «Личный кабинет» — только для авторизованных, верхний уровень */}
              {isAuthenticated && (
                <NavigationMenuItem>
                  <NavigationMenuLink asChild className={navigationMenuTriggerStyle()}>
                    <Link to="/profile">Личный кабинет</Link>
                  </NavigationMenuLink>
                </NavigationMenuItem>
              )}
            </NavigationMenuList>
          </NavigationMenu>

          {/* Анонимный вариант: кнопка «Авторизоваться» */}
          {!isAuthenticated && (
            <Button
              asChild
              variant="default"
              size="sm"
              className="bg-blue-800 hover:bg-blue-900 dark:bg-blue-500 dark:hover:bg-blue-400"
            >
              <Link to="/auth">Авторизоваться</Link>
            </Button>
          )}

          {/* Авторизованный вариант: аватар + дропдаун */}
          {isAuthenticated && user && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  aria-label={`Меню пользователя ${displayName}`}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-800 text-xs font-semibold text-white hover:bg-blue-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-800 dark:bg-blue-500 dark:hover:bg-blue-400"
                >
                  {getInitials(displayName)}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {/* Имя и email — только просмотр */}
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
                  <Link to="/profile">Личный кабинет</Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleLogout}
                  className="text-rose-600 focus:text-rose-600 dark:text-rose-400"
                >
                  Выйти
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </header>
  );
}
