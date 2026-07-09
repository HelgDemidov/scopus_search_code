// Инициалы для аватара пользователя (Header.tsx desktop-dropdown + MobileNavSheet.tsx).
// Вынесено из Header.tsx — совместный экспорт компонента и обычной функции из
// одного файла ломает react-refresh/only-export-components (--max-warnings 0).
export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
