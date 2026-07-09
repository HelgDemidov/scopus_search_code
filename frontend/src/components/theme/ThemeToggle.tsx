import { Moon, Sun } from 'lucide-react';
import { Button } from '../ui/button';
import { useTheme } from '../../hooks/useTheme';
import { cn } from '../../lib/utils';

interface ThemeToggleProps {
  /** 'lg' — touch target ≥44×44 (WCAG 2.2, §4.3 ТЗ docs/layout-overhaul/spec.md),
   * используется в MobileNavSheet (Sheet — тач-контекст). Дефолт 'sm' —
   * прежний размер (32px), десктопная шапка не меняется. */
  size?: 'sm' | 'lg';
}

export function ThemeToggle({ size = 'sm' }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className={cn(
        'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100',
        size === 'lg' ? 'h-11 w-11' : 'h-8 w-8',
      )}
    >
      {isDark ? (
        <Sun className={size === 'lg' ? 'h-5 w-5' : 'h-4 w-4'} />
      ) : (
        <Moon className={size === 'lg' ? 'h-5 w-5' : 'h-4 w-4'} />
      )}
    </Button>
  );
}
