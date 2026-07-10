import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ResetPasswordPage from './ResetPasswordPage';

// ---------------------------------------------------------------------------
// Мок API и navigate
// ---------------------------------------------------------------------------

const mockConfirmPasswordReset = vi.fn();
vi.mock('../api/auth', () => ({
  confirmPasswordReset: (...args: unknown[]) => mockConfirmPasswordReset(...args),
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

// Sonner toast — мокируем чтобы не тянуть DOM-зависимости
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }));

// ---------------------------------------------------------------------------
// Хелпер рендера — монтирует страницу с нужным URL
// ---------------------------------------------------------------------------

function renderWithToken(token: string | null) {
  const url = token ? `/reset-password?token=${token}` : '/reset-password';
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/forgot-password" element={<div>ForgotPassword</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

const VALID_PASSWORD = 'NewPass1!';

// ---------------------------------------------------------------------------
// Тесты
// ---------------------------------------------------------------------------

describe('ResetPasswordPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('показывает сообщение об ошибке когда токен отсутствует в URL', () => {
    renderWithToken(null);
    expect(screen.getByText(/invalid or missing reset link/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /request a new reset link/i })).toBeInTheDocument();
  });

  it('отображает форму с двумя полями пароля при наличии токена', () => {
    renderWithToken('valid-token-abc');
    expect(screen.getByLabelText('New password')).toBeInTheDocument();
    expect(screen.getByLabelText('Confirm new password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /update password/i })).toBeInTheDocument();
  });

  it('после успешного сброса навигирует на /auth (с языковым префиксом — /reset-password вне /:lang, useLocalizedNavigate фоллбэчится на текущий i18n.language)', async () => {
    mockConfirmPasswordReset.mockResolvedValueOnce(undefined);
    renderWithToken('valid-token-abc');

    await userEvent.type(screen.getByLabelText('New password'), VALID_PASSWORD);
    await userEvent.type(screen.getByLabelText('Confirm new password'), VALID_PASSWORD);
    await userEvent.click(screen.getByRole('button', { name: /update password/i }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/en/auth', { replace: true });
    });
    expect(mockConfirmPasswordReset).toHaveBeenCalledWith('valid-token-abc', VALID_PASSWORD);
  });

  it('показывает inline-ошибку при 422 (истёкший/невалидный токен)', async () => {
    mockConfirmPasswordReset.mockRejectedValueOnce({ response: { status: 422 } });
    renderWithToken('expired-token');

    await userEvent.type(screen.getByLabelText('New password'), VALID_PASSWORD);
    await userEvent.type(screen.getByLabelText('Confirm new password'), VALID_PASSWORD);
    await userEvent.click(screen.getByRole('button', { name: /update password/i }));

    await waitFor(() => {
      expect(screen.getByText(/invalid or has expired/i)).toBeInTheDocument();
    });
    // Ссылка "Request a new link" доступна рядом с ошибкой
    expect(screen.getByRole('link', { name: /request a new link/i })).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('показывает generic-ошибку при сетевом сбое (не 422)', async () => {
    mockConfirmPasswordReset.mockRejectedValueOnce(new Error('Network error'));
    renderWithToken('valid-token');

    await userEvent.type(screen.getByLabelText('New password'), VALID_PASSWORD);
    await userEvent.type(screen.getByLabelText('Confirm new password'), VALID_PASSWORD);
    await userEvent.click(screen.getByRole('button', { name: /update password/i }));

    await waitFor(() => {
      expect(screen.getByText(/server error/i)).toBeInTheDocument();
    });
  });

  it('показывает ошибку Zod если пароли не совпадают', async () => {
    renderWithToken('valid-token');

    await userEvent.type(screen.getByLabelText('New password'), VALID_PASSWORD);
    await userEvent.type(screen.getByLabelText('Confirm new password'), 'DifferentPass2@');
    await userEvent.click(screen.getByRole('button', { name: /update password/i }));

    await waitFor(() => {
      expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument();
    });
    expect(mockConfirmPasswordReset).not.toHaveBeenCalled();
  });

  it('показывает ошибку Zod при слабом пароле (нет спецсимвола)', async () => {
    renderWithToken('valid-token');

    await userEvent.type(screen.getByLabelText('New password'), 'WeakPass1');
    await userEvent.type(screen.getByLabelText('Confirm new password'), 'WeakPass1');
    await userEvent.click(screen.getByRole('button', { name: /update password/i }));

    await waitFor(() => {
      expect(screen.getByText(/special character/i)).toBeInTheDocument();
    });
    expect(mockConfirmPasswordReset).not.toHaveBeenCalled();
  });
});
