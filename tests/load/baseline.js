import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '10s', target: 20 }, // Плавно поднимаем нагрузку до 20 виртуальных пользователей
    { duration: '30s', target: 20 }, // Держим нагрузку 30 секунд
    { duration: '10s', target: 0 },  // Плавно завершаем
  ],
  thresholds: {
    // P95 < 500мс, P99 < 1000мс
    http_req_duration: ['p(95)<500', 'p(99)<1000'], 
    // Менее 1% ошибок
    http_req_failed: ['rate<0.01'],                 
  },
};

// Запуск с локальным бэкендом по умолчанию
const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000';

export default function () {
  // 1. Полнотекстовый поиск (симуляция ввода запроса)
  const res1 = http.get(`${BASE_URL}/articles/?q=machine+learning&page=1&size=20`);
  check(res1, {
    'search status is 200': (r) => r.status === 200,
    'search response has items': (r) => {
        try {
            return JSON.parse(r.body).items !== undefined;
        } catch {
            return false;
        }
    }
  });
  sleep(1); // Имитируем чтение результатов

  // 2. Аналитика и графики (journal-landscape)
  const res2 = http.get(`${BASE_URL}/articles/stats/journal-impact?max_year=2024`);
  check(res2, {
    'stats status is 200': (r) => r.status === 200,
  });
  sleep(1); // Имитируем изучение графиков
}
