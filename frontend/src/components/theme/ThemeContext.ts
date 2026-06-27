import { createContext } from 'react';

export type Theme = 'light' | 'dark';

export interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
}

// Дефолт 'light' — компоненты без ThemeProvider получают светлую тему.
// Критично для тестов: хуки, читающие контекст, не ломаются без провайдера.
export const ThemeContext = createContext<ThemeContextValue>({
  theme: 'light',
  toggleTheme: () => {},
});
