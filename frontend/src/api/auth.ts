// API-функции авторизации (§2.1 спека)
//
// login                — POST /users/login (JSON: { email, password })
// register             — POST /users/register (JSON)
// passwordResetRequest — POST /users/password-reset-request (JSON)
// refreshAccessToken   — POST /auth/refresh (RT передается как httpOnly cookie)
// serverLogout         — POST /auth/logout (отзывает RT на сервере)

import { apiClient } from './client';
import type { TokenResponse } from '../types/api';

// ---------------------------------------------------------------------------
// POST /users/login — email/password аутентификация
// ---------------------------------------------------------------------------

export interface LoginCredentials {
  email: string;
  password: string;
}

export async function login(credentials: LoginCredentials): Promise<TokenResponse> {
  // Отправляем JSON-тело — бэкенд принимает UserLoginRequest (email + password)
  // Content-Type: application/json применяется автоматически из глобального apiClient
  const response = await apiClient.post<TokenResponse>('/users/login', {
    email: credentials.email,
    password: credentials.password,
  }, {
    withCredentials: true,  // необходимо для получения RT httpOnly cookie
  });
  return response.data;
}

// ---------------------------------------------------------------------------
// POST /users/register — регистрация нового пользователя
// ---------------------------------------------------------------------------

export interface RegisterData {
  username: string;
  email: string;
  password: string;
  password_confirm: string;
}

export interface RegisterResponse {
  id: number;
  username: string | null;
  email: string;
  created_at: string | null;
}

export async function register(data: RegisterData): Promise<RegisterResponse> {
  const response = await apiClient.post<RegisterResponse>('/users/register', data);
  return response.data;
}

// ---------------------------------------------------------------------------
// POST /users/password-reset-request — запрос сброса пароля
// ---------------------------------------------------------------------------

export async function passwordResetRequest(email: string): Promise<void> {
  await apiClient.post('/users/password-reset-request', { email });
}

// ---------------------------------------------------------------------------
// POST /auth/refresh — тихое обновление AT через RT cookie
// ---------------------------------------------------------------------------

export async function refreshAccessToken(): Promise<string> {
  // withCredentials: true — axios включает httpOnly cookie в cross-origin запрос
  // RT передается автоматически браузером, JS его не читает
  // X-Requested-With — CSRF-guard, ожидаемый бэкендом на /auth/refresh
  const response = await apiClient.post<TokenResponse>(
    '/auth/refresh',
    {},
    {
      withCredentials: true,
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
    },
  );
  return response.data.access_token;
}

// ---------------------------------------------------------------------------
// POST /auth/logout — серверный logout с отзывом RT
// ---------------------------------------------------------------------------

export async function serverLogout(): Promise<void> {
  // withCredentials: true — браузер отправляет RT cookie для отзыва на сервере
  await apiClient.post('/auth/logout', {}, { withCredentials: true });
}
