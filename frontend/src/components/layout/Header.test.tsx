import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, beforeEach } from 'vitest';
import { Header } from './Header';
import { useAuthStore } from '../../stores/authStore';
import i18n from '../../i18n';

// Sheet НЕ застаблен здесь намеренно (в отличие от MobileNavSheet.test.tsx):
// реальный закрытый Radix Dialog не монтирует SheetContent в DOM, поэтому
// "Explore" встречается только один раз (из плоской NavigationMenu) — без
// этого пришлось бы разруливать дубликаты текста между шапкой и Sheet.
// Содержимое самого Sheet — предмет MobileNavSheet.test.tsx, не этого файла.
function renderHeader() {
  return render(
    <MemoryRouter>
      <Header />
    </MemoryRouter>,
  );
}

describe('Header', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    useAuthStore.setState({ isAuthenticated: false, user: null });
  });

  it('<sm: рендерит бургер-триггер (h-11 w-11, sm:hidden) с доступной подписью', () => {
    renderHeader();
    const trigger = screen.getByRole('button', { name: 'Open menu' });
    expect(trigger).toHaveClass('h-11', 'w-11', 'sm:hidden');
  });

  it('≥sm: плоская группа (ThemeToggle/LanguageSwitcher/nav) скрыта классом hidden sm:flex, но остаётся в DOM', () => {
    renderHeader();
    const themeButton = screen.getByRole('button', { name: /switch to (dark|light) mode/i });
    expect(themeButton.parentElement).toHaveClass('hidden', 'sm:flex');
  });

  it('≥sm: ссылка "Explore" плоской шапки рендерится один раз (Sheet закрыт по умолчанию)', () => {
    renderHeader();
    expect(screen.getAllByRole('link', { name: 'Explore' })).toHaveLength(1);
  });

  it('логотип остаётся видимым вне скрытой группы (не зависит от брейкпоинта)', () => {
    const { container } = renderHeader();
    // Не через accessible-name (svg aria-label + соседний текст дают
    // неоднозначное вычисляемое имя) — ищем по href напрямую. Анонимный
    // пользователь (isAuthenticated=false в beforeEach) → role-based
    // /main; вне /:lang-поддерева LocalizedLink использует DEFAULT_URL_LANG.
    const logo = container.querySelector('a[href="/en/main"]');
    expect(logo).not.toBeNull();
    expect(logo?.parentElement?.parentElement?.tagName).toBe('HEADER');
  });
});
