// Расширяет стандартные матчеры Vitest матчерами jest-dom:
// toBeInTheDocument, toBeDisabled, toHaveAttribute, toHaveTextContent и др.
import '@testing-library/jest-dom';
// Инициализируем i18next с английскими переводами перед каждым тестом.
// Тесты работают с реальными EN-строками — не требуется обновлять существующие тесты.
import '../i18n';

// Добавляем A11y-матчеры (toHaveNoViolations)
// color-contrast принципиально непроверяем в jsdom — не только из-за
// getContext('2d') (см. "Not implemented: HTMLCanvasElement.prototype.
// getContext" в выводе тестов), а прежде всего потому, что jsdom вообще не
// реализует layout: getBoundingClientRect/offsetWidth/getClientRects всегда
// возвращают 0, и axe не может определить видимый размер текста. Пакет
// `canvas` (devDependency) сюда НЕ добавлен — проверено эмпирически
// (2026-07-11, docs/a11y-canvas-coverage/spec.md): он не чинит эту
// проблему, а ухудшает диагностику — без него color-contrast попадает в
// axe-результатах в `incomplete` ("нужна ручная проверка", видимо), с ним —
// в `inapplicable` (тихо исключается: node-canvas без системных шрифтов
// даёт вырожденные метрики текста, из-за чего эвристика _isIconLigature
// ошибочно решает, что перед ней не текст). Итог: axe в этих тестах —
// надёжная страховка от структурных/ARIA-нарушений (роли, фокус,
// discernible name), но не замена периодической ручной/Lighthouse-проверки
// цветового контраста — см. `src/test/axeColorContrast.guard.test.tsx`.
import * as matchers from 'vitest-axe/matchers';
import { expect } from 'vitest';
expect.extend(matchers);
