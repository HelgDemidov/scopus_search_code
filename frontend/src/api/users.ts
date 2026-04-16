// API-функции для профиля пользователя (§2.2 спека)
//
// getMe — GET /users/me
// Приватный эндпоинт — требует JWT (добавляется через request interceptor в client.ts)
// Возвращает данные текущего пользователя: id, username, email, created_at

import { apiClient } from './client';
import type { UserResponse } from '../types/api';

export async function getMe(): Promise<UserResponse> {
  const response = await apiClient.get<UserResponse>('/users/me');
  return response.data;
}
