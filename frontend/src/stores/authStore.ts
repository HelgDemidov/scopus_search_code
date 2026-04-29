import { create } from 'zustand';
import { getMe } from '../api/users';
import type { UserResponse } from '../types/api';

// Интерфейс стора авторизации — §4.3
interface AuthStore {
  token: string | null;
  user: {
    id: number;
    username: string | null; // null у Google OAuth пользователей
    email: string;
    created_at: string | null;
  } | null;
  isAuthenticated: boolean;
  // Флаг гидрации: true пока приложение не завершило проверку сессии на старте.
  // PrivateRoute показывает spinner вместо редиректа, пока isHydrating === true
  isHydrating: boolean;

  // Экшены
  setToken: (token: string) => void;
  fetchUser: () => Promise<void>;
  logout: () => Promise<void>;
  setHydrating: (value: boolean) => void;
}

// Читаем токен синхронно до create() — до первого рендера React.
// Без этого PrivateRoute видит isAuthenticated=false и редиректит на /auth.
// localStorage будет убран в Commit 3; пока сохраняем для совместимости.
const _initialToken = localStorage.getItem('access_token');

export const useAuthStore = create<AuthStore>((set) => ({
  // Синхронная инициализация — токен извлекаем до первого рендера
  token: _initialToken,
  isAuthenticated: !!_initialToken,
  user: null,
  // Гидрация начинается при монтировании App; завершается в finally refreshAccessToken
  isHydrating: true,

  // Сохраняем токен и в localStorage, и в стор одновременно.
  setToken: (token: string) => {
    localStorage.setItem('access_token', token);
    set({ token, isAuthenticated: true });
  },

  // Запрашиваем профиль текущего пользователя через GET /users/me.
  // Вызывается после setToken (OAuth callback, login, hydration)
  fetchUser: async () => {
    try {
      const user: UserResponse = await getMe();
      set({
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          created_at: user.created_at,
        },
      });
    } catch {
      // 401 перехватит axios response interceptor → silent refresh или logout
    }
  },

  // Серверный logout: отзываем RT на бэкенде, затем очищаем локальное состояние
  logout: async () => {
    try {
      // Динамический импорт разрывает циклическую зависимость store ← api/auth ← client ← store
      const { serverLogout } = await import('../api/auth');
      await serverLogout();
    } catch {
      // Сетевая ошибка — выполняем локальный logout в любом случае
    } finally {
      localStorage.removeItem('access_token');
      set({ token: null, user: null, isAuthenticated: false });
    }
  },

  // Управляет флагом гидрации; вызывается из App.tsx в finally блоке
  setHydrating: (value: boolean) => set({ isHydrating: value }),
}));
