import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Sheet, SheetContent } from './sheet';

// ---------------------------------------------------------------------------
// Regression-тест на docs/explore-charts-refactor/spec.md §2: базовый
// SheetContent раньше хардкодил per-side размеры (data-[side=right]:w-3/4,
// data-[side=right]:h-full, data-[side=right]:sm:max-w-sm и т.д.) прямо в
// className. Атрибутный селектор data-[side=X] имеет более высокую
// CSS-специфичность, чем обычный/responsive-класс потребителя — поэтому
// оверрайды DimensionDrawer/ArticleFilters физически проигрывали браузерному
// каскаду, несмотря на то что tailwind-merge не дедуплицирует их (разные
// цепочки вариантов). Итог был измерен на живом проде: desktop max-width
// 384px вместо 672px; mobile height 1201px вместо ~778px, панель на 287px
// выше видимой области — отсюда баги «слишком узкая панель» и «нельзя
// прокрутить на мобильном».
//
// jsdom не выполняет реальный CSS-каскад (Tailwind-CSS в тестовое окружение
// не подгружается — vitest.environment: 'jsdom' без css:true), поэтому
// getComputedStyle().maxWidth здесь ничего не скажет о специфичности.
// Вместо этого тест фиксирует сам инвариант на уровне строки className:
// базовый компонент не должен содержать конфликтующие размерные утилиты ни
// для одной из 4 сторон — это именно то, что вызвало баг, и именно это
// нельзя случайно вернуть обратно.
// ---------------------------------------------------------------------------

function getContentClassName(side: 'top' | 'right' | 'bottom' | 'left'): string {
  render(
    <Sheet open modal={false}>
      <SheetContent data-testid={`content-${side}`} side={side} className="consumer-sizing-class" showCloseButton={false} />
    </Sheet>
  );
  const el = screen.getByTestId(`content-${side}`);
  return el.className;
}

describe('SheetContent — базовый className не задаёт размер по умолчанию', () => {
  const sides = ['top', 'right', 'bottom', 'left'] as const;

  it.each(sides)('side=%s: не содержит конфликтующих width-утилит (w-*, sm:max-w-*)', (side) => {
    const className = getContentClassName(side);
    expect(className).not.toMatch(/data-\[side=(left|right)\]:w-/);
    expect(className).not.toMatch(/data-\[side=(left|right)\]:sm:max-w-/);
  });

  it.each(sides)('side=%s: не содержит конфликтующих height-утилит (h-full, h-auto)', (side) => {
    const className = getContentClassName(side);
    expect(className).not.toMatch(/data-\[side=(left|right)\]:h-full/);
    expect(className).not.toMatch(/data-\[side=(bottom|top)\]:h-auto/);
  });

  it.each(sides)('side=%s: className потребителя доходит до DOM без изменений', (side) => {
    const className = getContentClassName(side);
    expect(className).toContain('consumer-sizing-class');
  });

  it('базовый компонент сохранил структурные data-side классы (позиционирование/границы)', () => {
    const className = getContentClassName('right');
    // Структурные классы (не размерные) — намеренно остались, чтобы не потерять
    // позиционирование панели при рефакторинге
    expect(className).toMatch(/data-\[side=right\]:inset-y-0/);
    expect(className).toMatch(/data-\[side=right\]:right-0/);
    expect(className).toMatch(/data-\[side=right\]:border-l/);
  });

  it('анимации используют data-[state=open]/data-[state=closed], а не v4-синтаксис data-open:/data-closed:', () => {
    // Radix (radix-ui пакет, Dialog.Content) выставляет атрибут data-state="open"|"closed",
    // а не булевый data-open/data-closed — бывший v4-only bare-синтаксис в этом
    // Tailwind v3-проекте молча не срабатывал (см. память feedback-tailwind-v3-data-variants)
    const className = getContentClassName('right');
    expect(className).toMatch(/data-\[state=open\]:animate-in/);
    expect(className).toMatch(/data-\[state=closed\]:animate-out/);
    expect(className).not.toMatch(/(?<!\[)data-open:/);
    expect(className).not.toMatch(/(?<!\[)data-closed:/);
  });
});
