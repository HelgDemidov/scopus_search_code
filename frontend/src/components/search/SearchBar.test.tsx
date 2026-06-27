import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SearchBar } from './SearchBar';

function setup(onSearch = vi.fn()) {
  render(<SearchBar onSearch={onSearch} />);
  const input = screen.getByRole('textbox');
  const button = screen.getByRole('button', { name: /search/i });
  return { input, button, onSearch };
}

describe('SearchBar', () => {
  describe('валидация минимальной длины', () => {
    it('не вызывает onSearch и показывает ошибку при пустом запросе', () => {
      const { button, onSearch } = setup();
      fireEvent.click(button);
      expect(onSearch).not.toHaveBeenCalled();
      expect(screen.getByRole('alert')).toHaveTextContent(/at least 2/i);
    });

    it('не вызывает onSearch и показывает ошибку при 1 символе', () => {
      const { input, button, onSearch } = setup();
      fireEvent.change(input, { target: { value: 'a' } });
      fireEvent.click(button);
      expect(onSearch).not.toHaveBeenCalled();
      expect(screen.getByRole('alert')).toHaveTextContent(/at least 2/i);
    });

    it('вызывает onSearch при ровно 2 символах', () => {
      const { input, button, onSearch } = setup();
      fireEvent.change(input, { target: { value: 'ai' } });
      fireEvent.click(button);
      expect(onSearch).toHaveBeenCalledWith('ai');
    });

    it('вызывает onSearch при запросе из нескольких слов', () => {
      const { input, button, onSearch } = setup();
      fireEvent.change(input, { target: { value: 'neural networks' } });
      fireEvent.click(button);
      expect(onSearch).toHaveBeenCalledWith('neural networks');
    });

    it('trim: "  a  " (1 символ после trim) показывает ошибку', () => {
      const { input, button, onSearch } = setup();
      fireEvent.change(input, { target: { value: '  a  ' } });
      fireEvent.click(button);
      expect(onSearch).not.toHaveBeenCalled();
      expect(screen.getByRole('alert')).toBeTruthy();
    });

    it('trim: "  ai  " (2 символа после trim) проходит валидацию', () => {
      const { input, button, onSearch } = setup();
      fireEvent.change(input, { target: { value: '  ai  ' } });
      fireEvent.click(button);
      expect(onSearch).toHaveBeenCalledWith('ai');
    });
  });

  describe('очистка ошибки', () => {
    it('ошибка исчезает при следующем вводе символа', () => {
      const { input, button } = setup();
      fireEvent.click(button); // вызвать ошибку (пустой запрос)
      expect(screen.getByRole('alert')).toBeTruthy();
      fireEvent.change(input, { target: { value: 'x' } });
      expect(screen.queryByRole('alert')).toBeNull();
    });

    it('успешный сабмит очищает предыдущую ошибку', () => {
      const { input, button } = setup();
      fireEvent.click(button); // ошибка
      fireEvent.change(input, { target: { value: 'neural networks' } });
      fireEvent.click(button); // успешный поиск
      expect(screen.queryByRole('alert')).toBeNull();
    });
  });

  describe('доступность (a11y)', () => {
    it('input получает aria-invalid=true при ошибке', () => {
      const { input, button } = setup();
      fireEvent.click(button);
      expect(input).toHaveAttribute('aria-invalid', 'true');
    });

    it('input НЕ имеет aria-invalid в нормальном состоянии', () => {
      const { input } = setup();
      expect(input).not.toHaveAttribute('aria-invalid');
    });

    it('aria-describedby указывает на элемент с текстом ошибки', () => {
      const { input, button } = setup();
      fireEvent.click(button);
      const errorId = input.getAttribute('aria-describedby');
      expect(errorId).toBeTruthy();
      expect(document.getElementById(errorId!)).toHaveTextContent(/at least 2/i);
    });
  });
});
