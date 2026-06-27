import { useContext } from 'react';
import { ThemeContext } from '../components/theme/ThemeContext';

export function useTheme() {
  return useContext(ThemeContext);
}
