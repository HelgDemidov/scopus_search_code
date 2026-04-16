import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';

/**
 * Обработчик Google OAuth redirect — Вариант A (§4.3).
 * Бэкенд возвращает RedirectResponse на /auth/callback?token=<jwt>.
 * Компонент читает параметр token, сохраняет его 和 редиректит на главную.
 */
export default function OAuthCallback() {
  const navigate = useNavigate();
  const { setToken, fetchUser } = useAuthStore();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');

    if (token) {
      // Сохраняем токен в localStorage и стор, затем загружаем профиль
      setToken(token);
      fetchUser().then(() => navigate('/'));
    } else {
      // Токен отсутствует — что-то пошло не так
      navigate('/auth?error=oauth_failed');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-slate-500 dark:text-slate-400">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-800 dark:border-slate-700 dark:border-t-blue-500" />
        <p className="text-sm">Signing you in…</p>
      </div>
    </div>
  );
}
