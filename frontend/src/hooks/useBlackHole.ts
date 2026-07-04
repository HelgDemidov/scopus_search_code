import { useEffect } from 'react';
import { setBlackHole, type BlackHolePosition } from '../stores/blackHoleStore';

// Регистрирует чёрную дыру в StarFieldCanvas на время жизни компонента
// (error-страницы) и снимает её при размонтировании — эффект не должен
// «утекать» на обычные страницы после ухода с error-страницы.
export function useBlackHole(position: BlackHolePosition): void {
  useEffect(() => {
    setBlackHole(position);
    return () => setBlackHole(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
