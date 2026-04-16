// API-функции для статистики коллекции (§2.1 спека)
//
// getStats — GET /articles/stats
// Публичный эндпоинт — JWT не требуется
// Возвращает агрегированную статистику по is_seeded=TRUE статьям

import { apiClient } from './client';
import type { StatsResponse } from '../types/api';

export async function getStats(): Promise<StatsResponse> {
  const response = await apiClient.get<StatsResponse>('/articles/stats');
  return response.data;
}
