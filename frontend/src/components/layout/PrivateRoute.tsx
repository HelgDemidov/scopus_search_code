import { Navigate, Outlet } from 'react-router-dom';
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
 * 2. !isAuthenticated      → редиректим на /auth (пользователь не залогинен)
 * 3. иначе                 → рендерим дочерние маршруты через Outlet
 *
 * Без проверки isHydrating PrivateRoute редиректил бы на /auth в момент
 * холодного старта, когда refreshAccessToken ещё не завершился, даже
 * если у пользователя есть валидный RT cookie.
 */
export function PrivateRoute() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isHydrating    = useAuthStore((state) => state.isHydrating);

  // Гидрация не завершена — не принимаем решение о доступе
  if (isHydrating) {
    return <HydrationSpinner />;
  }

  if (!isAuthenticated) {
    // replace: true — не засоряем историю браузера при редиректе
    return <Navigate to="/auth" replace />;
  }

  // Рендерим дочерние маршруты
  return <Outlet />;
}
