import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { axe } from 'vitest-axe';

// Guard-тест для самой a11y-инфраструктуры: пинает, что именно axe-core
// реально способен проверить в jsdom, а что — нет, и почему.
//
// Исследовано эмпирически (2026-07-11) перед этим файлом: пакет `canvas`
// НЕ устанавливается — он не решает проблему, а ухудшает сигнал. Прямое
// сравнение results.incomplete/inapplicable с canvas и без:
//   без canvas: color-contrast → incomplete ("нужна ручная проверка", видимо)
//   с canvas:   color-contrast → inapplicable (правило тихо исключено)
// Root cause правила color-contrast — не отсутствие Canvas 2D как такового,
// а то, что jsdom вообще не реализует layout: getBoundingClientRect/
// offsetWidth/offsetHeight/getClientRects всегда возвращают 0 для любого
// элемента, и axe не может определить видимый размер текста. Отдельно,
// getContext('2d') используется axe только для одной узкой эвристики —
// определения "иконочных лигатур" (_isIconLigature, axe.js). node-canvas
// без реальных системных шрифтов даёт вырожденные метрики текста, из-за
// чего эта эвристика ошибочно решает, что обычный текст — не текст, и
// правило схлопывается в inapplicable вместо incomplete. Итог: contrast-
// проверка в jsdom принципиально не работает — это задокументированное
// ограничение всей экосистемы jest-axe/vitest-axe (не баг этого проекта),
// решается только браузерными инструментами (Lighthouse-CI, Storybook a11y
// addon, Cypress/Playwright-axe), не пакетом внутри jsdom.
describe('a11y-инфраструктура — что axe реально проверяет в jsdom', () => {
  it('color-contrast НЕ попадает в violations даже для заведомо нечитаемого текста', async () => {
    const { container } = render(
      <div style={{ backgroundColor: '#ffffff', padding: 8 }}>
        <p style={{ color: '#cccccc' }}>Едва читаемый текст едва читаемый текст едва читаемый</p>
      </div>,
    );
    const results = await axe(container);
    // Не false-negative "всё ок" — правило вообще не смогло определиться
    // (incomplete), поэтому toHaveNoViolations() в обычных axe-тестах
    // проекта никогда не поймает реальный контраст-баг, независимо от
    // фактических цветов.
    expect(results.violations.some((v) => v.id === 'color-contrast')).toBe(false);
    expect(results.incomplete.some((v) => v.id === 'color-contrast')).toBe(true);
  });

  it('структурные/ARIA-нарушения (не завязанные на layout) axe в jsdom ловит надёжно', async () => {
    const { container } = render(
      // eslint-disable-next-line jsx-a11y/alt-text -- нарочно без alt: это и есть проверяемое нарушение
      <img src="/placeholder.png" />,
    );
    const results = await axe(container);
    expect(results.violations.some((v) => v.id === 'image-alt')).toBe(true);
  });
});
