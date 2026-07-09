// Расширяет стандартные матчеры Vitest матчерами jest-dom:
// toBeInTheDocument, toBeDisabled, toHaveAttribute, toHaveTextContent и др.
import '@testing-library/jest-dom';
// Инициализируем i18next с английскими переводами перед каждым тестом.
// Тесты работают с реальными EN-строками — не требуется обновлять существующие тесты.
import '../i18n';

// Добавляем A11y-матчеры (toHaveNoViolations)
// jsdom не реализует Canvas 2D без опционального пакета `canvas` — axe-core
// тихо не может проверить часть правила color-contrast (определение
// иконочных лигатур через измерение текста на канве), это видно в выводе
// теста как "Not implemented: HTMLCanvasElement.prototype.getContext".
// Итог: axe в этих тестах — надёжная страховка от структурных/ARIA-нарушений
// (роли, фокус, discernible name), но не замена периодической ручной/
// Lighthouse-проверки цветового контраста.
import * as matchers from 'vitest-axe/matchers';
import { expect } from 'vitest';
expect.extend(matchers);
