// API-функции авторизации (§2.1 спека)
//
// login                — POST /users/login (form-data, не JSON!)
// register             — POST /users/register (JSON)
// passwordResetRequest — POST /users/password-reset-request (JSON)
//
// ВАЖНО: бэкенд использует OAuth2PasswordRequestForm для /users/login,
// который принимает application/x-www-form-urlencoded с полем 'username'.
// В UI поле называется 'Email', но в HTTP-запросе ключ должен быть 'username'.

import { apiClient } from './client';
import type { TokenResponse } from '../types/api';

// ---------------------------------------------------------------------------
// POST /users/login — email/password аутентификация
// ---------------------------------------------------------------------------

export interface LoginCredentials {
  // email пользователя — передается как поле 'username' в form-data
  email: string;
  password: string;
}

export async function login(credentials: LoginCredentials): Promise<TokenResponse> {
  // Формируем application/x-www-form-urlencoded с ключом 'username'
  const formData = new URLSearchParams();
  formData.append('username', credentials.email);  // ключ — username, значение — email
  formData.append('password', credentials.password);

  const response = await apiClient.post<TokenResponse>('/users/login', formData, {
    headers: {
      // Явно указываем Content-Type — axios по умолчанию использует json
      'Content-Type': 'application/x-www-form-urlencoded',
    },
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
