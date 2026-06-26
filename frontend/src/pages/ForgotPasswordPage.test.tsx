import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import ForgotPasswordPage from './ForgotPasswordPage';

// ---------------------------------------------------------------------------
// Мок API — объявляем ДО первого импорта страницы
// ---------------------------------------------------------------------------

const mockRequestPasswordReset = vi.fn();
vi.mock('../api/auth', () => ({
  requestPasswordReset: (...args: unknown[]) => mockRequestPasswordReset(...args),
}));

// ---------------------------------------------------------------------------
// Хелпер рендера
// ---------------------------------------------------------------------------

function renderPage() {
  return render(
    <MemoryRouter>
      <ForgotPasswordPage />
    </MemoryRouter>,
  );
}

// ---------------------------------------------------------------------------
// Тесты
// ---------------------------------------------------------------------------

describe('ForgotPasswordPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('отображает форму с полем email и кнопкой отправки', () => {
    renderPage();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send reset link/i })).toBeInTheDocument();
  });

  it('показывает success-сообщение после успешной отправки', async () => {
    mockRequestPasswordReset.mockResolvedValueOnce(undefined);
    renderPage();

    await userEvent.type(screen.getByLabelText('Email'), 'user@example.com');
    await userEvent.click(screen.getByRole('button', { name: /send reset link/i }));

    await waitFor(() => {
      expect(screen.getByText(/check your email/i)).toBeInTheDocument();
    });
    expect(mockRequestPasswordReset).toHaveBeenCalledWith('user@example.com');
  });

  it('показывает то же success-сообщение при любом ответе сервера (не раскрываем аккаунт)', async () => {
    // Сервер всегда отвечает 200 — фронтенд показывает одно сообщение
    mockRequestPasswordReset.mockResolvedValueOnce(undefined);
    renderPage();

    await userEvent.type(screen.getByLabelText('Email'), 'unknown@example.com');
    await userEvent.click(screen.getByRole('button', { name: /send reset link/i }));

    await waitFor(() => {
      expect(screen.getByText(/check your email/i)).toBeInTheDocument();
    });
  });

  it('показывает error-сообщение при сетевой ошибке', async () => {
    mockRequestPasswordReset.mockRejectedValueOnce(new Error('Network error'));
    renderPage();

    await userEvent.type(screen.getByLabelText('Email'), 'user@example.com');
    await userEvent.click(screen.getByRole('button', { name: /send reset link/i }));

    await waitFor(() => {
      expect(screen.getByText(/server error/i)).toBeInTheDocument();
    });
    // Форма остаётся видимой — пользователь может повторить попытку
    expect(screen.getByRole('button', { name: /send reset link/i })).toBeInTheDocument();
  });

  it('показывает ошибку валидации при невалидном email', async () => {
    renderPage();
    await userEvent.type(screen.getByLabelText('Email'), 'not-an-email');
    await userEvent.click(screen.getByRole('button', { name: /send reset link/i }));

    await waitFor(() => {
      expect(screen.getByText(/invalid email/i)).toBeInTheDocument();
    });
    expect(mockRequestPasswordReset).not.toHaveBeenCalled();
  });
});
