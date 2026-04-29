import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';

/**
 * Google OAuth redirect handler — Variant A (§4.3).
 * The backend returns a RedirectResponse to /auth/callback?token=<jwt>.
 * This component reads the token param, stores it in-memory (AT) and
 * in localStorage (for cold-start hydration), then redirects to the home page.
 */
export default function OAuthCallback() {
  const navigate = useNavigate();
  const { setToken, fetchUser } = useAuthStore();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');

    if (token) {
      // Сохраняем AT через setToken, затем загружаем профиль пользователя
      setToken(token);
      fetchUser().then(() => navigate('/'));
    } else {
      // Token is missing — something went wrong
      navigate('/auth?error=oauth_failed');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-slate-500 dark:text-slate-400">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-800 dark:border-slate-700 dark:border-t-blue-500" />
        <p className="text-sm">Signing in…</p>
      </div>
    </div>
  );
}
