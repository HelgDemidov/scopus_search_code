import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';

// Spinner — переиспользует тот же визуальный стиль, что и PageFallback в App.tsx
function HydrationSpinner() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-800 dark:border-slate-700 dark:border-t-blue-500" />
    </div>
  );
}

/**
 * Защищённый маршрут: читает isHydrating и isAuthenticated из authStore.
 *
 * Порядок проверок:
 * 1. isHydrating === true  → показываем spinner; ждём завершения гидрации
 * 2. !isAuthenticated      → редиректим на /auth с сохранением from-location
 * 3. иначе                 → рендерим дочерние маршруты через Outlet
 *
 * Без проверки isHydrating PrivateRoute редиректил бы на /auth в момент
 * холодного старта, когда refreshAccessToken ещё не завершился, даже
 * если у пользователя есть валидный RT cookie.
 *
 * state={{ from: location }} передаётся в /auth, чтобы после успешного логина
 * пользователь возвращался на ту страницу, с которой его выбросило.
 */
export function PrivateRoute() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isHydrating    = useAuthStore((state) => state.isHydrating);
  const location       = useLocation();

  // Гидрация не завершена — не принимаем решение о доступе
  if (isHydrating) {
    return <HydrationSpinner />;
  }

  if (!isAuthenticated) {
    // replace: true — не засоряем историю браузера при редиректе;
    // from сохраняется, чтобы AuthPage мог вернуть пользователя обратно
    return <Navigate to="/auth" replace state={{ from: location }} />;
  }

  // Рендерим дочерние маршруты
  return <Outlet />;
}
