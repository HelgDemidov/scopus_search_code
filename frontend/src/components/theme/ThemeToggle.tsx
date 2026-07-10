import { Moon, Sun } from 'lucide-react';
import { Button } from '../ui/button';
import { useTheme } from '../../hooks/useTheme';

// Всегда видима в Header (<sm тоже, см. Header.tsx) — размер респонсивный,
// не JS-проп: h-11/w-11 (44×44, WCAG 2.2 touch target, §4.3 ТЗ
// docs/layout-overhaul/spec.md) на <sm, компактные h-8/w-8 на ≥sm (мышиный
// десктоп-контекст, прежний вид не меняется).
export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="h-11 w-11 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 sm:h-8 sm:w-8"
    >
      {isDark ? <Sun className="h-5 w-5 sm:h-4 sm:w-4" /> : <Moon className="h-5 w-5 sm:h-4 sm:w-4" />}
    </Button>
  );
}
