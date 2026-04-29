// Единственный axios-инстанс приложения (§2.4 спека)
//
// Все API-модули импортируют apiClient из этого файла —
// не создают собственные экземпляры axios.
//
// Request interceptor: добавляет Authorization: Bearer <token> к каждому запросу.
// Токен читается из authStore в памяти (не из localStorage — Commit 3).
// Ленивый геттер через уже загруженный ES-модуль разрывает circular dependency:
//   client.ts → authStore → api/users → client.ts
// К моменту первого HTTP-запроса весь ES-граф уже инициализирован Vite,
// поэтому require()-style доступ к модулю безопасен.
//
// Response interceptor: при получении 401 Unauthorized
// пытается тихо обновить AT через RT cookie (silent refresh).
// Если RT тоже истёк — диспатчит CustomEvent('auth:logout-required');
// App.tsx слушает событие и вызывает logout() на сторе.
// PrivateRoute реагирует на isAuthenticated: false и редиректит на /auth.
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
// Ленивый геттер токена — разрывает circular dependency без dynamic import()
// ---------------------------------------------------------------------------

// Функция вызывается только внутри interceptor-колбэка, то есть не раньше
// первого HTTP-запроса. К этому моменту Vite уже полностью разрешил
// ES-граф и authStore-модуль инициализирован. Прямой статический импорт
// authStore здесь вызвал бы circular dependency на этапе парсинга модулей.
function getAuthToken(): string | null {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useAuthStore } = require('./stores/authStore') as typeof import('./stores/authStore');
  return useAuthStore.getState().token;
}

// ---------------------------------------------------------------------------
// Request interceptor — добавляем Bearer-токен из стора (in-memory)
// ---------------------------------------------------------------------------

apiClient.interceptors.request.use((config) => {
  const token = getAuthToken();
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
        // IIFE позволяет использовать await для динамического импорта,
        // при этом присваивание refreshingPromise происходит синхронно —
        // до любого await. Все параллельные interceptor'ы увидят непустой
        // синглтон и не запустят второй POST /auth/refresh.
        refreshingPromise = (async () => {
          // Динамический импорт разрывает циклическую зависимость
          // client.ts → auth.ts → client.ts
          const { refreshAccessToken } = await import('./auth');
          return refreshAccessToken();
        })()
          .then((newToken) => {
            // AT хранится только в памяти — localStorage не пишем.
            // Уведомляем App.tsx через CustomEvent: он вызовет setToken + fetchUser
            window.dispatchEvent(
              new CustomEvent('auth:token-refreshed', { detail: newToken })
            );
            return newToken;
          })
          .catch((err) => {
            // RT истёк или отозван — уведомляем App.tsx для чистого logout.
            // Не делаем window.location.href здесь: PrivateRoute отреагирует
            // на isAuthenticated: false и выполнит навигацию через React Router.
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
