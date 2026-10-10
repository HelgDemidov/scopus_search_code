// PostCSS конфиг в ESM-синтаксисе (package.json содержит "type": "module").
// Tailwind v4 подключается одним плагином @tailwindcss/postcss — он же заменяет
// autoprefixer и postcss-import. Конфигурация темы живёт в src/index.css (@theme).
// НЕ используем @tailwindcss/vite — держим единый PostCSS-пайплайн.
export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
}
