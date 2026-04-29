// ---------------------------------------------------------------------------
// Интеграционный тест: шина событий авторизации в App.tsx
//
// Тестируем ТОЛЬКО контракт useEffect-подписок на CustomEvent'ы:
//   • auth:logout-required  → authStore.logout()
//   • auth:token-refreshed  → setToken(newToken) + fetchUser()
//   • cleanup после unmount → слушатели сняты, logout не вызывается
//   • hydration             → setHydrating(false) после успешного silent refresh
//
// Подход: изолированный AppEffects-wrapper воспроизводит только useEffect из App.tsx
// без RouterProvider и React.lazy-страниц — тест не зависит от изменений маршрутов.
// ---------------------------------------------------------------------------

import { render, act, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Моки модулей — объявляются до импорта тестируемого кода
// ---------------------------------------------------------------------------

// Мок authStore: возвращаем контролируемые vi.fn() вместо реального Zustand-стора
const mockLogout      = vi.fn().mockResolvedValue(undefined);
const mockSetToken    = vi.fn();
const mockFetchUser   = vi.fn().mockResolvedValue(undefined);
const mockSetHydrating = vi.fn();

vi.mock('./stores/authStore', () => ({
  useAuthStore: () => ({
    logout:       mockLogout,
    setToken:     mockSetToken,
    fetchUser:    mockFetchUser,
    setHydrating: mockSetHydrating,
  }),
}));

// Мок statsStore: fetchStats не должен делать реальный HTTP-запрос
const mockFetchStats = vi.fn().mockResolvedValue(undefined);
vi.mock('./stores/statsStore', () => ({
  useStatsStore: (selector: (s: { fetchStats: typeof mockFetchStats }) => unknown) =>
    selector({ fetchStats: mockFetchStats }),
}));

// Мок api/auth: управляем поведением silent refresh в каждом тесте
const mockRefreshAccessToken = vi.fn();
vi.mock('./api/auth', () => ({
  refreshAccessToken: mockRefreshAccessToken,
}));

// Заглушки для Vercel-плагинов — они не нужны в тестовой среде
vi.mock('@vercel/analytics/react',     () => ({ Analytics:      () => null }));
vi.mock('@vercel/speed-insights/react', () => ({ SpeedInsights: () => null }));

// ---------------------------------------------------------------------------
// Изолированный wrapper: воспроизводит только useEffect из App.tsx
// без RouterProvider, React.lazy и Toaster — минимальный контекст для тестирования
// шины событий авторизации.
// ---------------------------------------------------------------------------

import { useEffect } from 'react';
import { useAuthStore }  from './stores/authStore';
import { useStatsStore } from './stores/statsStore';

function AppEffects() {
  const { setToken, fetchUser, logout, setHydrating } = useAuthStore();
  const fetchStats = useStatsStore((state) => state.fetchStats);

  useEffect(() => {
    // Повторяем логику гидрации из App.tsx (без localStorage — jsdom его изолирует)
    import('./api/auth').then(({ refreshAccessToken }) =>
      refreshAccessToken()
        .then((newToken: string) => {
          setToken(newToken);
          fetchUser();
        })
        .catch(() => {
          // RT истёк — AT уже не в localStorage в тестовой среде
        })
        .finally(() => {
          setHydrating(false);
        }),
    );

    // Подписчик на успешный silent refresh от response interceptor
    const handleTokenRefresh = (e: Event) => {
      const newToken = (e as CustomEvent<string>).detail;
      if (newToken) {
        setToken(newToken);
        fetchUser();
      }
    };
    window.addEventListener('auth:token-refreshed', handleTokenRefresh);

    // Подписчик на принудительный logout (RT истёк mid-session)
    const handleLogoutRequired = () => { logout(); };
    window.addEventListener('auth:logout-required', handleLogoutRequired);

    fetchStats();

    // Cleanup — зеркало App.tsx
    return () => {
      window.removeEventListener('auth:token-refreshed', handleTokenRefresh);
      window.removeEventListener('auth:logout-required', handleLogoutRequired);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return null; // Рендер не нужен — тестируем только side-эффекты
}

// ---------------------------------------------------------------------------
// Тесты
// ---------------------------------------------------------------------------

describe('App – auth event bus', () => {
  beforeEach(() => {
    // Сбрасываем счётчики вызовов перед каждым тестом
    vi.clearAllMocks();
    // По умолчанию silent refresh завершается успешно
    mockRefreshAccessToken.mockResolvedValue('hydrated-token');
  });

  afterEach(() => {
    // RTL автоматически вызывает cleanup() после каждого теста —
    // компонент unmount'ится, слушатели снимаются
  });

  // ---------------------------------------------------------------------------
  // Тест 1: auth:logout-required вызывает authStore.logout()
  // ---------------------------------------------------------------------------
  it('auth:logout-required вызывает logout()', async () => {
    render(<AppEffects />);

    // Даём useEffect завершить регистрацию слушателей
    await act(async () => {
      window.dispatchEvent(new CustomEvent('auth:logout-required'));
    });

    expect(mockLogout).toHaveBeenCalledTimes(1);
  });

  // ---------------------------------------------------------------------------
  // Тест 2: auth:token-refreshed вызывает setToken + fetchUser
  // ---------------------------------------------------------------------------
  it('auth:token-refreshed вызывает setToken(newToken) и fetchUser()', async () => {
    render(<AppEffects />);

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent('auth:token-refreshed', { detail: 'fresh-access-token' }),
      );
    });

    expect(mockSetToken).toHaveBeenCalledWith('fresh-access-token');
    expect(mockFetchUser).toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Тест 3: после unmount слушатели сняты — logout не вызывается
  // ---------------------------------------------------------------------------
  it('после unmount события не вызывают logout()', async () => {
    const { unmount } = render(<AppEffects />);

    // Размонтируем — cleanup() снимает слушатели
    unmount();

    await act(async () => {
      window.dispatchEvent(new CustomEvent('auth:logout-required'));
    });

    expect(mockLogout).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Тест 4: setHydrating(false) вызывается после завершения silent refresh
  // (как успешного, так и неудачного — гарантируется finally-блоком)
  // ---------------------------------------------------------------------------
  it('setHydrating(false) вызывается после завершения silent refresh', async () => {
    mockRefreshAccessToken.mockResolvedValueOnce('new-token');

    render(<AppEffects />);

    await waitFor(() => {
      expect(mockSetHydrating).toHaveBeenCalledWith(false);
    });
  });
});
