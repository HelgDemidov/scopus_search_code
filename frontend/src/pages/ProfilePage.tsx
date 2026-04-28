import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useQuotaStore } from '../stores/quotaStore';
import { useHistoryStore } from '../stores/historyStore';
import { Button } from '../components/ui/button';
import { Skeleton } from '../components/ui/skeleton';
import { LiveSearchQuotaCounter } from '../components/profile/LiveSearchQuotaCounter';
import { SearchHistoryList } from '../components/profile/SearchHistoryList';

// Format registration date: DD MMM YYYY
function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(iso));
}

// Generate two-letter initials for the avatar
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Page skeleton — mirrors the identity block structure
function ProfilePageSkeleton() {
  return (
    <div className="mx-auto max-w-screen-sm px-4 py-10">
      <Skeleton className="h-7 w-24 mb-6" />
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6">
        <div className="flex items-center gap-4 mb-6">
          <Skeleton className="h-14 w-14 rounded-full" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-48" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-4 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const navigate = useNavigate();
  const { user, isAuthenticated, logout } = useAuthStore();
  const fetchQuota = useQuotaStore((s) => s.fetchQuota);
  const fetchHistory = useHistoryStore((s) => s.fetchHistory);

  const displayName = user ? (user.username ?? user.email.split('@')[0]) : '';

  // Guard: redirect immediately if authentication is lost
  useEffect(() => {
    if (isAuthenticated === false) {
      navigate('/auth', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    fetchQuota();
    fetchHistory();
  }, [fetchQuota, fetchHistory]);

  function handleSignOut() {
    logout();
    navigate('/');
  }

  // Skeleton instead of spinner — visually consistent with the page structure
  if (!user) {
    return <ProfilePageSkeleton />;
  }

  return (
    <div className="mx-auto max-w-screen-sm px-4 py-10">
      <h1 className="mb-6 text-xl font-semibold text-slate-900 dark:text-slate-100">Profile</h1>

      {/* Identity block */}
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
          <dt className="text-slate-500 dark:text-slate-400">Username</dt>
          <dd className="font-medium text-slate-900 dark:text-slate-100">
            {user.username ?? '—'}
          </dd>

          <dt className="text-slate-500 dark:text-slate-400">Email</dt>
          <dd className="font-medium text-slate-900 dark:text-slate-100 break-all">
            {user.email}
          </dd>

          <dt className="text-slate-500 dark:text-slate-400">Member since</dt>
          <dd className="font-medium text-slate-900 dark:text-slate-100">
            {formatDate(user.created_at)}
          </dd>
        </dl>
      </div>

      {/* Scopus live-search quota */}
      <div className="mt-4">
        <LiveSearchQuotaCounter />
      </div>

      {/* Search history */}
      <div className="mt-4">
        <SearchHistoryList />
      </div>

      {/* Sign out */}
      <div className="mt-6">
        <Button
          variant="outline"
          onClick={handleSignOut}
          className="border-rose-200 text-rose-600 hover:bg-rose-50 hover:border-rose-300 dark:border-rose-800 dark:text-rose-400 dark:hover:bg-rose-900/30"
        >
          Sign out
        </Button>
      </div>
    </div>
  );
}
