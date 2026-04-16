import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';

/**
 * Защищённый маршрут: читает isAuthenticated из authStore.
 * Если пользователь не аутентифицирован, редиректит на /auth.
 * Используется в App.tsx для защиты маршрута /profile.
 */
export function PrivateRoute() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  if (!isAuthenticated) {
    // replace: true — не засоряем историю браузера при редиректе
    return <Navigate to="/auth" replace />;
  }

  // Рендерим дочерние маршруты
  return <Outlet />;
}
