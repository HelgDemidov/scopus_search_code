import type { Config } from 'tailwindcss'
import animate from 'tailwindcss-animate'

// Конфигурация Tailwind CSS v3 для проекта Scopus Search Frontend.
// ВАЖНО: используем v3, не v4 — shadcn/ui и Tremor v3 несовместимы с v4.
// darkMode: 'class' — переключение темы через атрибут класса на <html>.
const config: Config = {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{ts,tsx,js,jsx}',
    // Tremor v3 требует сканирования своих компонентов для safelist
    './node_modules/@tremor/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      // Шрифты проекта
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      // Брендовые и UI-цвета (используются в компонентах и chartColors.ts)
      colors: {
        brand: {
          DEFAULT: '#2563eb', // синий акцент
          hover:   '#1d4ed8',
          light:   '#eff6ff',
          dark:    '#1e40af',
        },
        surface: {
          DEFAULT: '#ffffff',
          muted:   '#f8fafc', // slate-50
          border:  '#e2e8f0', // slate-200
        },
        // Палитра для чартов Tremor — 6 именованных цветов Tailwind.
        // Tremor v3 принимает только именованные цвета ('blue', 'teal' и т.д.),
        // не HEX напрямую. Кастомные HEX-цвета добавляются через theme.extend.colors
        // и затем передаются как строки-ключи в Tremor color props.
        'chart-1': '#3b82f6', // blue-500
        'chart-2': '#14b8a6', // teal-500
        'chart-3': '#f59e0b', // amber-500
        'chart-4': '#8b5cf6', // violet-500
        'chart-5': '#10b981', // emerald-500
        'chart-6': '#f43f5e', // rose-500
      },
      // Скругления — переопределяем под shadcn Nova пресет
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
  // Safelist для Tremor v3: классы генерируются динамически и должны
  // присутствовать в финальном CSS-бандле независимо от сканирования контента.
  safelist: [
    {
      pattern:
        /^(bg|text|border|ring|fill|stroke)-(blue|teal|amber|violet|emerald|rose|slate|gray|zinc|neutral|stone|red|orange|yellow|lime|green|cyan|sky|indigo|purple|fuchsia|pink)-(\d{2,3}|\d00)$/,
    },
    // Tremor layout-классы
    'tremor-Card-root',
    'tremor-Title-root',
    'tremor-Text-root',
    'tremor-Metric-root',
    'tremor-BadgeDelta-root',
    'tremor-DonutChart-root',
    'tremor-BarChart-root',
    'tremor-LineChart-root',
  ],
  plugins: [
    // Плагин анимаций для shadcn/ui компонентов (accordion, dialog и т.д.)
    animate,
  ],
}

export default config
