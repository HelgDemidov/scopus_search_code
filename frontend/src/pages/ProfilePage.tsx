import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useQuotaStore } from '../stores/quotaStore';
import { useHistoryStore } from '../stores/historyStore';
import { Button } from '../components/ui/button';
import { LiveSearchQuotaCounter } from '../components/profile/LiveSearchQuotaCounter';
import { SearchHistoryList } from '../components/profile/SearchHistoryList';

// Форматируем дату регистрации: DD MMM YYYY
function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(iso));
}

// Генерация двух буквенных инициалов для аватара
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function ProfilePage() {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const fetchQuota = useQuotaStore((s) => s.fetchQuota);
  const fetchHistory = useHistoryStore((s) => s.fetchHistory);

  const displayName = user ? (user.username ?? user.email.split('@')[0]) : '';

  useEffect(() => {
    fetchQuota();
    fetchHistory();
  }, [fetchQuota, fetchHistory]);

  function handleSignOut() {
    logout();
    navigate('/');
  }

  if (!user) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-800 dark:border-slate-700 dark:border-t-blue-500" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-screen-sm px-4 py-10">
      <h1 className="mb-6 text-xl font-semibold text-slate-900 dark:text-slate-100">Профиль</h1>

      {/* Блок идентификации */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-800 text-white text-lg font-semibold dark:bg-blue-500">
            {getInitials(displayName)}
          </div>
          <div>
            <p className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {displayName}
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-400">{user.email}</p>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <dt className="text-slate-500 dark:text-slate-400">Имя пользователя</dt>
          <dd className="font-medium text-slate-900 dark:text-slate-100">
            {user.username ?? '—'}
          </dd>

          <dt className="text-slate-500 dark:text-slate-400">Email</dt>
          <dd className="font-medium text-slate-900 dark:text-slate-100 break-all">
            {user.email}
          </dd>

          <dt className="text-slate-500 dark:text-slate-400">Дата регистрации</dt>
          <dd className="font-medium text-slate-900 dark:text-slate-100">
            {formatDate(user.created_at)}
          </dd>
        </dl>
      </div>

      {/* Квота live-поиска Scopus */}
      <div className="mt-4">
        <LiveSearchQuotaCounter />
      </div>

      {/* История поиска */}
      <div className="mt-4">
        <SearchHistoryList />
      </div>

      {/* Выход */}
      <div className="mt-6">
        <Button
          variant="outline"
          onClick={handleSignOut}
          className="border-rose-200 text-rose-600 hover:bg-rose-50 hover:border-rose-300 dark:border-rose-800 dark:text-rose-400 dark:hover:bg-rose-900/30"
        >
          Выйти
        </Button>
      </div>
    </div>
  );
}
