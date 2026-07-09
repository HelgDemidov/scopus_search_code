import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import jsxA11y from "eslint-plugin-jsx-a11y";

export default tseslint.config(
  { ignores: ["dist"] },
  jsxA11y.flatConfigs.recommended,
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
    },
  },
  {
    // shadcn/ui компоненты экспортируют variantFn рядом с компонентом — стандартный паттерн
    files: ["src/components/ui/**/*.{ts,tsx}"],
    rules: { "react-refresh/only-export-components": "off" },
  },
  {
    // router.tsx осознанно смешивает layout-компоненты (RootLayout) с route-данными
    // (appRoutes/router) — appRoutes нужен как единственный источник истины для
    // регрессионного теста ArticleCard.test.tsx. Fast refresh для конфига роутинга некритичен.
    files: ["src/router.tsx"],
    rules: { "react-refresh/only-export-components": "off" },
  },
  {
    // Ambient-декларация для vitest-axe (module augmentation): интерфейс обязан
    // дословно повторить сигнатуру `Assertion<T = any>` из @vitest/expect, иначе
    // TS не сможет смержить объявления — отсюда неиспользуемый T/any и "пустой"
    // интерфейс, для которых допустимая замена (utility-тип и т.п.) недоступна.
    files: ["src/vitest.d.ts"],
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-empty-object-type": [
        "error",
        { allowInterfaces: "with-single-extends" },
      ],
    },
  },
);
