// Единственный axios-инстанс приложения (§2.4 спека)
//
// Все API-модули импортируют apiClient из этого файла —
// не создают собственные экземпляры axios.
//
// Request interceptor: добавляет Authorization: Bearer <token> к каждому запросу,
// если токен присутствует в localStorage.
//
// Response interceptor (401): при получении 401 Unauthorized
// пытается тихо обновить AT через RT cookie (silent refresh).
// Если RT тоже истёк — диспатчит CustomEvent('auth:logout-required');
// App.tsx слушает событие и вызывает store.logout() —
// PrivateRoute редиректит на /auth через React Router без hard reload.
// Параллельные 401 ждут один Promise-синглтон — race condition исключён.
//
// Response interceptor (non-401): сетевые ошибки и 5xx показывают
// toast-уведомление через sonner; отменённые запросы (AbortController)
// пропускаются без уведомления.

import axios from 'axios';
import { toast } from 'sonner';

// Базовый URL берется из переменной окружения Vite.
// Production: VITE_API_BASE_URL = 'https://scopus-search-code.up.railway.app' (Railway)
// Dev: задать в .env.local как VITE_API_BASE_URL=http://localhost:8000
// Фоллбэк '' работает только если настроен Vercel rewrites /api/:path* → Railway
const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

// Валидация переменной окружения при инициализации модуля
if (!BASE_URL) {
  if (import.meta.env.DEV) {
    // В dev режиме предупреждаем — запросы без baseURL пойдут на Vite dev-сервер
    console.warn(
      '[apiClient] VITE_API_BASE_URL не задан. ' +
      'Создайте frontend/.env.local с VITE_API_BASE_URL=http://localhost:8000'
    );
  } else {
    // В production пустой BASE_URL означает сломанную конфигурацию Vercel
    console.error(
      '[apiClient] VITE_API_BASE_URL не задан в production. ' +
      'Все API-запросы упадут. Проверьте Environment Variables в Vercel.'
    );
  }
}

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
// Response interceptor — 401 (silent refresh) + non-401 (global error handler)
// ---------------------------------------------------------------------------

apiClient.interceptors.response.use(
  // Успешный ответ — пропускаем без изменений
  (response) => response,

  async (error) => {
    const originalRequest = error.config;

    // --- Блок 1: 401 — silent refresh (существующая логика, не изменена) ---
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
            localStorage.setItem('access_token', newToken);
            window.dispatchEvent(
              new CustomEvent('auth:token-refreshed', { detail: newToken })
            );
            return newToken;
          })
          .catch((err) => {
            window.dispatchEvent(new CustomEvent('auth:logout-required'));
            return Promise.reject(err);
          })
          .finally(() => {
            refreshingPromise = null;
          });
      }

      const newToken = await refreshingPromise;
      originalRequest.headers['Authorization'] = `Bearer ${newToken}`;
      return apiClient(originalRequest);
    }

    // --- Блок 2: non-401 глобальный обработчик ошибок ---

    // Отменённые запросы (AbortController из fetchArticles) — пропускаем молча
    if (axios.isCancel(error)) {
      return Promise.reject(error);
    }

    // Сетевые ошибки и таймауты (!error.response — ответа от сервера нет вообще)
    if (!error.response) {
      toast.warning('Network error. Check your connection and try again.');
      return Promise.reject(error);
    }

    const status = error.response.status;

    // 5xx — ошибки на стороне сервера, пользователь должен знать
    if (status >= 500) {
      toast.error(`Server error (${status}). Please try again later.`);
      return Promise.reject(error);
    }

    // 4xx (403, 404, 422, 429 и др.) — контекстные ошибки;
    // каждый стор обрабатывает их самостоятельно с точным сообщением
    return Promise.reject(error);
  },
);
