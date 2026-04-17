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
// Если RT тоже истёк — выполняет полный logout и редиректит на /auth.
// Очередь параллельных запросов ждет завершения refresh и повторяется с новым AT.

import axios from 'axios';

// Базовый URL берется из переменной окружения Vite;
// при локальной разработке Vite proxy перехватывает /api → localhost:8000
const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

export const apiClient = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// ---------------------------------------------------------------------------
// Request interceptor — добавляем Bearer-токен
// ---------------------------------------------------------------------------

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`;
  }
  return config;
});

// ---------------------------------------------------------------------------
// Silent refresh state — флаг и очередь ожидающих запросов
// ---------------------------------------------------------------------------

// Флаг предотвращает параллельные вызовы /auth/refresh
let isRefreshing = false;

// Очередь запросов, которые пришли пока шел refresh — повторятся с новым AT
let refreshQueue: Array<(token: string) => void> = [];

function processQueue(newToken: string): void {
  refreshQueue.forEach((cb) => cb(newToken));
  refreshQueue = [];
}

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

      if (!isRefreshing) {
        // Мы первый — запускаем refresh
        isRefreshing = true;
        try {
          // Динамический импорт разрывает циклическую зависимость
          // client.ts → auth.ts → client.ts
          const { refreshAccessToken } = await import('./auth');
          const newToken = await refreshAccessToken();

          // Сохраняем новый AT в localStorage
          localStorage.setItem('access_token', newToken);

          // Уведомляем authStore через CustomEvent — избегаем прямого импорта стора
          window.dispatchEvent(
            new CustomEvent('auth:token-refreshed', { detail: newToken })
          );

          // Выполняем все накопившиеся запросы из очереди
          processQueue(newToken);

          // Повторяем оригинальный запрос с новым токеном
          originalRequest.headers['Authorization'] = `Bearer ${newToken}`;
          return apiClient(originalRequest);
        } catch {
          // RT истёк или отозван — полный logout
          localStorage.removeItem('access_token');
          processQueue(''); // разблокируем очередь (запросы упадут с 401)
          refreshQueue = [];
          if (!window.location.pathname.startsWith('/auth')) {
            window.location.href = '/auth';
          }
        } finally {
          isRefreshing = false;
        }
      } else {
        // Refresh уже идет — ставим запрос в очередь
        return new Promise((resolve) => {
          refreshQueue.push((token: string) => {
            originalRequest.headers['Authorization'] = `Bearer ${token}`;
            resolve(apiClient(originalRequest));
          });
        });
      }
    }

    return Promise.reject(error);
  },
);
