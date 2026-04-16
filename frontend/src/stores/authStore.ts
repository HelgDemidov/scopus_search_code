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

  // Экшены
  setToken: (token: string) => void;
  fetchUser: () => Promise<void>;
  logout: () => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  // Начальное состояние — токен в localStorage читает App.tsx при hydration
  token: null,
  user: null,
  isAuthenticated: false,

  // Сохраняем токен и в localStorage, и в стор одновременно
  setToken: (token: string) => {
    localStorage.setItem('access_token', token);
    set({ token, isAuthenticated: true });
  },

  // Запрашиваем профиль текущего пользователя через GET /users/me
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
      // 401 перехватит axios response interceptor → logout
      // Здесь дополнительных действий не нужно
    }
  },

  // Очищаем localStorage и сбрасываем стор; редирект делает axios interceptor
  logout: () => {
    localStorage.removeItem('access_token');
    set({ token: null, user: null, isAuthenticated: false });
  },
}));
