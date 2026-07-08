// Расширяет стандартные матчеры Vitest матчерами jest-dom:
// toBeInTheDocument, toBeDisabled, toHaveAttribute, toHaveTextContent и др.
import '@testing-library/jest-dom';
// Инициализируем i18next с английскими переводами перед каждым тестом.
// Тесты работают с реальными EN-строками — не требуется обновлять существующие тесты.
import '../i18n';

// Добавляем A11y-матчеры (toHaveNoViolations)
import * as matchers from 'vitest-axe/matchers';
import { expect } from 'vitest';
expect.extend(matchers);
