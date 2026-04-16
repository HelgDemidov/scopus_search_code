// Единственный axios-инстанс приложения (§2.4 спека)
//
// Все API-модули импортируют apiClient из этого файла —
// не создают собственные экземпляры axios.
//
// Request interceptor: добавляет Authorization: Bearer <token> к каждому запросу,
// если токен присутствует в localStorage.
//
// Response interceptor: при получении 401 Unauthorized
// очищает токен и перенаправляет пользователя на /auth.
// Редирект выполняется через window.location, а не React Router,
// чтобы избежать циклической зависимости (client.ts ← store ← client.ts).

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
// Response interceptor — обработка 401
// ---------------------------------------------------------------------------

apiClient.interceptors.response.use(
  // Успешный ответ — пропускаем без изменений
  (response) => response,

  // Ошибка ответа
  (error) => {
    if (error.response?.status === 401) {
      // Удаляем токен из хранилища
      localStorage.removeItem('access_token');

      // Перенаправляем на страницу авторизации,
      // если пользователь не находится на ней уже
      if (!window.location.pathname.startsWith('/auth')) {
        window.location.href = '/auth';
      }
    }
    return Promise.reject(error);
  },
);
