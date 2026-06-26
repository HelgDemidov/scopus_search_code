import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { clearTokenValue, getToken } from './tokenStore';

// ---------------------------------------------------------------------------
// Моки модулей — объявляем ДО первого импорта стора
// ---------------------------------------------------------------------------

// Мок серверного logout — разрывает циклическую зависимость store ← api/auth ← client ← store
const mockServerLogout = vi.fn().mockResolvedValue(undefined);
vi.mock('../api/auth', () => ({
  serverLogout: mockServerLogout,
  login: vi.fn(),
  register: vi.fn(),
}));

// Мок getMe — предотвращаем ненужные сетевые запросы в fetchUser
vi.mock('../api/users', () => ({
  getMe: vi.fn().mockResolvedValue({
    id: 1,
    username: 'testuser',
    email: 'test@example.com',
    created_at: '2024-01-01T00:00:00Z',
  }),
}));

// ---------------------------------------------------------------------------
// Импорты после vi.mock
// ---------------------------------------------------------------------------

import { useAuthStore } from './authStore';

// ---------------------------------------------------------------------------
// Начальное состояние стора — сбрасываем перед каждым тестом
// ---------------------------------------------------------------------------

const INITIAL_STATE = {
  token: null as string | null,
  user: null,
  isAuthenticated: false,
  isHydrating: true,
};

beforeEach(() => {
  // Сбрасываем Zustand-синглтон, tokenStore и моки
  useAuthStore.setState(INITIAL_STATE);
  clearTokenValue();
  localStorage.clear();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Блок 1: начальное состояние
// ---------------------------------------------------------------------------

describe('initial state', () => {
  it('isHydrating=true по умолчанию — PrivateRoute показывает spinner до завершения гидрации', () => {
    // Контракт начального состояния фиксирует, что PrivateRoute не редиректирует преждевременно
    expect(useAuthStore.getState().isHydrating).toBe(true);
  });

  it('isAuthenticated=false, token=null на старте', () => {
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().token).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Блок 2: setHydrating
// ---------------------------------------------------------------------------

describe('setHydrating', () => {
  it('setHydrating(false) сбрасывает флаг гидрации', () => {
    act(() => {
      useAuthStore.getState().setHydrating(false);
    });
    expect(useAuthStore.getState().isHydrating).toBe(false);
  });

  it('setHydrating(true) восстанавливает флаг', () => {
    useAuthStore.setState({ isHydrating: false });

    act(() => {
      useAuthStore.getState().setHydrating(true);
    });

    expect(useAuthStore.getState().isHydrating).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Блок 3: setToken
// ---------------------------------------------------------------------------

describe('setToken', () => {
  it('сохраняет token в Zustand state, устанавливает isAuthenticated=true', () => {
    act(() => {
      useAuthStore.getState().setToken('test.jwt.token');
    });

    const { token, isAuthenticated } = useAuthStore.getState();
    expect(token).toBe('test.jwt.token');
    expect(isAuthenticated).toBe(true);
  });

  it('сохраняет AT в tokenStore (in-memory), НЕ в localStorage', () => {
    act(() => {
      useAuthStore.getState().setToken('test.jwt.token');
    });

    // AT хранится только в памяти — XSS не имеет доступа через localStorage
    expect(getToken()).toBe('test.jwt.token');
    expect(localStorage.getItem('access_token')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Блок 4: logout
// ---------------------------------------------------------------------------

describe('logout', () => {
  it('очищает стор и tokenStore после успешного serverLogout', async () => {
    // Предустанавливаем авторизованное состояние через setToken (обновляет и стор, и tokenStore)
    act(() => { useAuthStore.getState().setToken('tok'); });

    await act(async () => {
      await useAuthStore.getState().logout();
    });

    const { token, user, isAuthenticated } = useAuthStore.getState();
    expect(token).toBeNull();
    expect(user).toBeNull();
    expect(isAuthenticated).toBe(false);
    expect(getToken()).toBeNull();
  });

  it('вызывает serverLogout через динамический импорт (циклическая зависимость)', async () => {
    await act(async () => {
      await useAuthStore.getState().logout();
    });

    expect(mockServerLogout).toHaveBeenCalledOnce();
  });

  it('очищает стор даже если serverLogout бросил ошибку (resilience)', async () => {
    // Сеть недоступна или RT уже недействителен — локальный logout всё равно выполняется
    mockServerLogout.mockRejectedValueOnce(new Error('Network error'));

    act(() => { useAuthStore.getState().setToken('tok'); });

    await act(async () => {
      await useAuthStore.getState().logout();
    });

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(getToken()).toBeNull();
  });
});
