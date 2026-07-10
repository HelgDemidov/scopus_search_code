import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { LocalizedLink } from './LocalizedLink';

function renderAt(initialPath: string, to: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path=":lang/*" element={<LocalizedLink to={to}>go</LocalizedLink>} />
        <Route path="*" element={<LocalizedLink to={to}>go</LocalizedLink>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('LocalizedLink', () => {
  it('добавляет префикс текущего :lang к href', () => {
    renderAt('/ru/search', '/explore');
    expect(screen.getByRole('link', { name: 'go' })).toHaveAttribute('href', '/ru/explore');
  });

  it('использует DEFAULT_URL_LANG вне /:lang-поддерева', () => {
    renderAt('/no-lang-here', '/main');
    expect(screen.getByRole('link', { name: 'go' })).toHaveAttribute('href', '/en/main');
  });

  it('пробрасывает остальные пропсы (напр. className) без изменений', () => {
    render(
      <MemoryRouter initialEntries={['/en/search']}>
        <Routes>
          <Route path=":lang/*" element={<LocalizedLink to="/auth" className="foo">sign in</LocalizedLink>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'sign in' })).toHaveClass('foo');
  });
});
