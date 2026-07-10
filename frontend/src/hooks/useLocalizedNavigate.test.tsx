import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { useLocalizedNavigate } from './useLocalizedNavigate';

// Один компонент — и триггер, и наблюдатель текущего URL: любой другой роут
// того же паттерна (напр. второй ':lang/*' для пункта назначения) конкурировал
// бы за ранжирование react-router с исходным и рендерился повторно тем же
// компонентом, а не отдельным "probe"-роутом.
function NavigateButtonAndProbe({ to }: { to: string }) {
  const navigate = useLocalizedNavigate();
  const location = useLocation();
  return (
    <div>
      <button onClick={() => navigate(to)}>go</button>
      <div data-testid="probe">{location.pathname + location.search}</div>
    </div>
  );
}

describe('useLocalizedNavigate', () => {
  it('навигирует с префиксом текущего :lang', async () => {
    render(
      <MemoryRouter initialEntries={['/ru/search']}>
        <Routes>
          <Route path=":lang/*" element={<NavigateButtonAndProbe to="/explore?mode=personal" />} />
        </Routes>
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'go' }));
    expect(await screen.findByTestId('probe')).toHaveTextContent('/ru/explore?mode=personal');
  });

  it('использует DEFAULT_URL_LANG вне /:lang-поддерева', async () => {
    render(
      <MemoryRouter initialEntries={['/somewhere']}>
        <Routes>
          <Route path="/somewhere" element={<NavigateButtonAndProbe to="/main" />} />
          <Route path=":lang/*" element={<NavigateButtonAndProbe to="/main" />} />
        </Routes>
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'go' }));
    expect(await screen.findByTestId('probe')).toHaveTextContent('/en/main');
  });
});
