import { matchRoutes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { appRoutes } from './router';

function lastMatch(path: string) {
  const matches = matchRoutes(appRoutes, path);
  return matches ? matches[matches.length - 1] : null;
}

// docs/error-experience/spec.md: path:'*' → NotFoundPage (404 семантически
// «такой страницы нет», не «ошибка» — отдельно от errorElement) +
// errorElement на корневом роуте для непойманных исключений.
describe('appRoutes error architecture', () => {
  it('resolves an arbitrary unknown path to the catch-all 404 route', () => {
    expect(lastMatch('/this-page-does-not-exist')?.route.path).toBe('*');
  });

  it('resolves a deeply nested unknown path to the same catch-all route', () => {
    expect(lastMatch('/a/b/c/d')?.route.path).toBe('*');
  });

  it('defines an errorElement on a pathless child route, not the root layout route', () => {
    // Не на appRoutes[0] (RootLayout/Header) — иначе при краше errorElement
    // заменил бы весь родительский элемент целиком, стерев Header вместе с
    // остальной хромом сайта. См. комментарий в router.tsx.
    const root = appRoutes[0];
    expect(root.errorElement).toBeUndefined();
    expect(root.children?.[0]?.errorElement).toBeTruthy();
  });

  it('still resolves known routes normally (no regression)', () => {
    expect(lastMatch('/explore')?.route.path).toBe('explore');
  });
});
