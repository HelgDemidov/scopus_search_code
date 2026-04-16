import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// НЕ импортируем @tailwindcss/vite — это плагин только для Tailwind v4;
// в нашем проекте используется Tailwind v3 через PostCSS-пайплайн
export default defineConfig({
  plugins: [react()],

  // Алиас @/ → src/ — используется в импортах вместо относительных путей
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },

  server: {
    // Прокси только для локальной разработки: /api/* → FastAPI localhost:8000
    // В production VITE_API_BASE_URL указывает напрямую на Railway-URL (без /api)
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },

  build: {
    // vendor-charts (Tremor + Recharts + D3) весит ~850 kB raw / 233 kB gzip —
    // это стабильный vendor-чанк, меняется только при обновлении библиотек,
    // а не при каждом деплое. Браузер кэширует его надолго. Порог поднят до
    // 1000 kB, чтобы Rollup не выдавал ложное предупреждение для vendor-bundle.
    // Перед public beta — рассмотреть замену Tremor на shadcn/ui Charts (Вариант 2).
    chunkSizeWarningLimit: 1000,

    rollupOptions: {
      output: {
        // Функциональная форма manualChunks предпочтительнее объектной:
        // Rollup сам резолвит все транзитивные зависимости без перечисления entry points
        manualChunks(id) {
          // Tremor, Recharts и D3 (депенденция Recharts) → отдельный чанк
          // Кэшируется браузером независимо от изменений в коде страниц
          if (
            id.includes('node_modules/@tremor') ||
            id.includes('node_modules/recharts') ||
            id.includes('node_modules/d3-')
          ) {
            return 'vendor-charts';
          }
          // react-dom и react-router — в отдельный чанк (React core уже есть в Vite prelude)
          if (
            id.includes('node_modules/react-dom') ||
            id.includes('node_modules/react-router')
          ) {
            return 'vendor-react';
          }
        },
      },
    },
  },
})
