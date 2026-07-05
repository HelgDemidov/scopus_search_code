import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ThemeContext } from './ThemeContext';
import type { Theme } from './ThemeContext';

const LS_THEME = 'theme';
const LS_ACTIVATED = 'nightSkyActivated';
const DURATION_FIRST = 3500;
const DURATION_REPEAT = 400;

function readInitialTheme(): Theme {
  const saved = localStorage.getItem(LS_THEME);
  if (saved === 'dark' || saved === 'light') return saved;
  return 'dark';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(readInitialTheme);
  const overlayRef = useRef<HTMLDivElement>(null);
  const pendingTimeouts = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Синхронизируем CSS-класс и localStorage при каждом изменении темы
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem(LS_THEME, theme);
  }, [theme]);

  // Очищаем таймауты при размонтировании
  useEffect(() => {
    const timeouts = pendingTimeouts.current;
    return () => { timeouts.forEach(clearTimeout); };
  }, []);

  const toggleTheme = useCallback(() => {
    const targetDark = theme === 'light';
    const overlay = overlayRef.current;

    // При prefers-reduced-motion — мгновенное переключение без анимации
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setTheme(targetDark ? 'dark' : 'light');
      if (targetDark) localStorage.setItem(LS_ACTIVATED, '1');
      return;
    }

    const isFirstActivation = targetDark && !localStorage.getItem(LS_ACTIVATED);
    const duration = isFirstActivation ? DURATION_FIRST : DURATION_REPEAT;

    if (!overlay) {
      setTheme(targetDark ? 'dark' : 'light');
      if (targetDark) localStorage.setItem(LS_ACTIVATED, '1');
      return;
    }

    // Overlay цвета целевой темы накрывает экран → скрывает момент переключения
    overlay.style.backgroundColor = targetDark ? '#0c1927' : '#ffffff';
    overlay.style.transition = `opacity ${duration}ms ease-in`;
    overlay.style.opacity = '0';
    overlay.style.display = 'block';

    // Двойной rAF гарантирует применение display:block до старта transition
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        overlay.style.opacity = '1';
      });
    });

    const t1 = setTimeout(() => {
      // Переключаем тему пока overlay непрозрачен — пользователь не видит скачка
      setTheme(targetDark ? 'dark' : 'light');
      if (targetDark) localStorage.setItem(LS_ACTIVATED, '1');

      overlay.style.transition = 'opacity 250ms ease-out';
      overlay.style.opacity = '0';

      const t2 = setTimeout(() => { overlay.style.display = 'none'; }, 250);
      pendingTimeouts.current.push(t2);
    }, duration);

    pendingTimeouts.current.push(t1);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
      {/* Overlay для плавного перехода; выше всего, не перехватывает ввод */}
      <div
        ref={overlayRef}
        aria-hidden="true"
        style={{
          position: 'fixed',
          inset: 0,
          display: 'none',
          opacity: 0,
          pointerEvents: 'none',
          zIndex: 99999,
        }}
      />
    </ThemeContext.Provider>
  );
}
