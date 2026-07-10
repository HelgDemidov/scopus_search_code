import { useEffect } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useLocalizedNavigate } from '../hooks/useLocalizedNavigate';

// Имя временной handshake cookie — должно совпадать с константой в бэкенде (_AT_HANDSHAKE_COOKIE)
const AT_HANDSHAKE_COOKIE = 'auth_handshake';

/** Читает значение cookie по имени из document.cookie */
function readCookie(name: string): string | null {
  const match = document.cookie
    .split('; ')
    .find((row) => row.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.split('=')[1]) : null;
}

/** Немедленно удаляет handshake cookie (max-age=0 — истекает немедленно) */
function clearHandshakeCookie(): void {
  document.cookie = `${AT_HANDSHAKE_COOKIE}=; max-age=0; path=/; secure; samesite=none`;
}

/**
 * Google OAuth redirect handler — Commit 2 (после бэкенд Commit 1).
 *
 * Бэкенд больше не передает AT через ?token= в URL (попадал в логи и referrer).
 * AT приходит через короткоживущую не-httpOnly cookie auth_handshake (5 мин).
 * RT httpOnly cookie установлена бэкендом на том же RedirectResponse — браузер
 * сохранил ее до выполнения редиректа (не cross-site drop согласно RFC 6265bis §5.4).
 */
export default function OAuthCallback() {
  const navigate = useLocalizedNavigate();
  const { setToken, fetchUser, setHydrating } = useAuthStore();

  useEffect(() => {
    // Читаем AT из handshake cookie и сразу удаляем её — окно доступности минимально
    const token = readCookie(AT_HANDSHAKE_COOKIE);
    clearHandshakeCookie();

    if (token) {
      // AT получен — сохраняем в localStorage через setToken, завершаем гидрацию
      setToken(token);
      // setHydrating(false) предотвращает race condition с App.tsx useEffect:
      // App.tsx тоже вызывает setHydrating(false) в .finally() — дублирование безвредно (Zustand идемпотентен)
      setHydrating(false);
      // Прямо на /search (не голый '/') — пользователь уже авторизован,
      // не нужен лишний прыжок через RootRedirect
      fetchUser().then(() => navigate('/search'));
    } else {
      // Handshake cookie отсутствует — OAuth-флоу не завершился
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
