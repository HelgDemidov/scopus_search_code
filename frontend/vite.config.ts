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
})
