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

export const useAuthStore = create<AuthStore>((set) => ({
  // AT хранится только в памяти — localStorage не используется (Commit 3).
  // isHydrating: true до завершения refreshAccessToken() в App.tsx
  token: null,
  isAuthenticated: false,
  user: null,
  isHydrating: true,

  // Сохраняем AT только в памяти стора — localStorage не пишем
  setToken: (token: string) => {
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

  // Серверный logout: отзываем RT на бэкенде, затем очищаем состояние
  logout: async () => {
    try {
      // Динамический импорт разрывает циклическую зависимость store ← api/auth ← client ← store
      const { serverLogout } = await import('../api/auth');
      await serverLogout();
    } catch {
      // Сетевая ошибка — выполняем локальный logout в любом случае
    } finally {
      // AT хранится только в памяти — localStorage больше не трогаем
      set({ token: null, user: null, isAuthenticated: false });
    }
  },

  // Управляет флагом гидрации; вызывается из App.tsx в finally блоке
  setHydrating: (value: boolean) => set({ isHydrating: value }),
}));
