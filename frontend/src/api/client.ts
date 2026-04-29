// Единственный axios-инстанс приложения (§2.4 спека)
//
// Все API-модули импортируют apiClient из этого файла —
// не создают собственные экземпляры axios.
//
// Request interceptor: добавляет Authorization: Bearer <token> к каждому запросу,
// если токен присутствует в localStorage.
//
// Response interceptor: при получении 401 Unauthorized
// пытается тихо обновить AT через RT cookie (silent refresh).
// Если RT тоже истёк — диспатчит CustomEvent('auth:logout-required');
// App.tsx слушает событие и вызывает store.logout() —
// PrivateRoute редиректит на /auth через React Router без hard reload.
// Параллельные 401 ждут один Promise-синглтон — race condition исключён.

import axios from 'axios';

// Базовый URL берется из переменной окружения Vite;
// при локальной разработке Vite proxy перехватывает /api → localhost:8000
const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

export const apiClient = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  // cross-origin cookie (RT httpOnly); единое место вместо per-call opt-in
  withCredentials: true,
});

// ---------------------------------------------------------------------------
// Request interceptor — добавляем Bearer-токен из localStorage
// ---------------------------------------------------------------------------

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`;
  }
  return config;
});

// ---------------------------------------------------------------------------
// Silent refresh state — Promise-синглтон вместо булевого флага
// ---------------------------------------------------------------------------

// Один активный Promise на весь жизненный цикл refresh.
// Все параллельные 401 ждут один и тот же Promise — race condition исключён:
// POST /auth/refresh вызывается ровно один раз, RT ротируется один раз.
let refreshingPromise: Promise<string> | null = null;

// ---------------------------------------------------------------------------
// Response interceptor — обработка 401 с silent refresh
// ---------------------------------------------------------------------------

apiClient.interceptors.response.use(
  // Успешный ответ — пропускаем без изменений
  (response) => response,

  async (error) => {
    const originalRequest = error.config;

    // Обрабатываем только 401 и только один раз (_retry защита от цикла)
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      if (!refreshingPromise) {
        // IIFE позволяет использовать await для динамического импорта;
        // присваивание refreshingPromise синхронно — все параллельные
        // interceptor'ы видят непустой синглтон и не запускают второй POST /auth/refresh
        refreshingPromise = (async () => {
          // Динамический импорт разрывает циклическую зависимость
          // client.ts → auth.ts → client.ts
          const { refreshAccessToken } = await import('./auth');
          return refreshAccessToken();
        })()
          .then((newToken) => {
            // Сохраняем новый AT в localStorage
            localStorage.setItem('access_token', newToken);
            // Уведомляем authStore через CustomEvent — избегаем прямого импорта стора
            window.dispatchEvent(
              new CustomEvent('auth:token-refreshed', { detail: newToken })
            );
            return newToken;
          })
          .catch((err) => {
            // RT истёк или отозван mid-session — диспатчим событие logout.
            // App.tsx вызывает logout(), который чистит стор и localStorage.
            // PrivateRoute реагирует на isAuthenticated: false через React Router —
            // никакого hard reload, никакого window.location.href
            window.dispatchEvent(new CustomEvent('auth:logout-required'));
            return Promise.reject(err);
          })
          .finally(() => {
            // Сбрасываем синглтон после завершения — следующий цикл refresh стартует чисто
            refreshingPromise = null;
          });
      }

      // Все параллельные 401 ждут один промис — при resolve каждый получает новый токен
      const newToken = await refreshingPromise;
      originalRequest.headers['Authorization'] = `Bearer ${newToken}`;
      return apiClient(originalRequest);
    }

    return Promise.reject(error);
  },
);
