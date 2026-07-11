/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { sentryVitePlugin } from '@sentry/vite-plugin'
import path from 'path'

// Source maps грузятся в Sentry только когда задан SENTRY_AUTH_TOKEN (Vercel:
// только Production env) — тот же graceful-degradation паттерн, что Redis/Brevo
// на бэкенде. Без токена: sourcemap:false, .map вообще не генерируются — CI
// (frontend-tests.yml:build) и Preview-деплои остаются без остаточного риска
// незапрошенных .map в dist/.
const sentryEnabled = Boolean(process.env.SENTRY_AUTH_TOKEN)

// НЕ импортируем @tailwindcss/vite — это плагин только для Tailwind v4;
// в нашем проекте используется Tailwind v3 через PostCSS-пайплайн
export default defineConfig({
  plugins: [
    react(),
    // sentryVitePlugin() уже возвращает массив плагинов — spread без
    // дополнительной обёртки в []
    ...(sentryEnabled
      ? sentryVitePlugin({
          org: 'scopus-search',
          project: 'scopus-react-frontend',
          authToken: process.env.SENTRY_AUTH_TOKEN,
          sourcemaps: {
            // Аплоадим и сразу удаляем из dist/ — иначе исходники были бы
            // публично скачиваемы с прод-домена
            filesToDeleteAfterUpload: ['**/*.map'],
          },
        })
      : []),
  ],

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
    // 'hidden' — генерирует .map, но НЕ добавляет //# sourceMappingURL= в
    // отданный бандл, браузер конечного пользователя их не подтягивает.
    // false — без токена .map вообще не генерируются (CI/Preview)
    sourcemap: sentryEnabled ? 'hidden' : false,
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

  test: {
    // jsdom эмулирует браузерный DOM — нужен для RTL-тестов компонентов
    environment: 'jsdom',
    // globals:true → describe/it/expect доступны без импорта (как в Jest)
    globals: true,
    // Подключаем jest-dom матчеры перед каждым тестом
    setupFiles: ['./src/test/setup.ts'],
    // Ищем тесты только в src/ — не захватываем node_modules и dist
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      // Бизнес-логика фронтенда: только файлы, для которых есть тесты.
      // Исключены: components/ui/ (vendor-код), components/charts/ (проброс в Tremor),
      // main.tsx (точка входа), api/auth|client|stats|users (нет тестов).
      include: [
        'src/api/articles.ts',
        // App.tsx исключён: v8 показывает 0% из-за vi.mock в App.integration.test.tsx —
        // инструментирование не работает через замоканные Lazy-роуты (ложный 0%).
        'src/components/articles/ArticleFilters.tsx',
        'src/components/articles/ArticleList.tsx',
        'src/components/articles/PaginationBar.tsx',
        'src/components/articles/ScopusPaginationBar.tsx',
        'src/components/layout/LocaleLayout.tsx',
        'src/hooks/usePagination.ts',
        'src/hooks/useDefaultLandingPath.ts',
        'src/hooks/useHreflangTags.tsx',
        'src/hooks/useLocalizedNavigate.ts',
        'src/hooks/useLocalizedPath.ts',
        'src/pages/AboutPage.tsx',
        'src/pages/ForgotPasswordPage.tsx',
        'src/pages/MainPage.tsx',
        'src/pages/PrivacyPage.tsx',
        'src/pages/SearchPage.tsx',
        'src/pages/ResetPasswordPage.tsx',
        'src/pages/TermsPage.tsx',
        'src/seo/generateSitemapXml.ts',
        'src/sentry.ts',
        'src/utils/localeRouting.ts',
        'src/stores/articleStore.ts',
        'src/stores/authStore.ts',
        'src/stores/historyStore.ts',
      ],
      thresholds: {
        statements: 70,
      },
    },
  },
})
