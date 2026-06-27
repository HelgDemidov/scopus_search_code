import { useTheme } from './useTheme';
import { DIMENSION_COLORS } from '../components/charts/chartColors';
import type { Dimension, DimensionColors } from '../components/charts/chartColors';

// Возвращает цветовой профиль измерения с учётом темы.
// Без ThemeProvider (в тестах) useTheme() → 'light' → возвращает стандартные светлые цвета.
export function useDimensionColors(dimension: Dimension): DimensionColors {
  const { theme } = useTheme();
  const colors = DIMENSION_COLORS[dimension];
  if (theme === 'dark') {
    return { ...colors, dimmed: colors.darkDimmed };
  }
  return colors;
}
