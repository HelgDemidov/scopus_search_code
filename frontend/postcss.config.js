// PostCSS конфиг в ESM-синтаксисе (package.json содержит "type": "module").
// tailwindcss и autoprefixer — стандартный v3 PostCSS-пайплайн.
// НЕ используем @tailwindcss/vite (это v4-специфичный пайплайн).
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
