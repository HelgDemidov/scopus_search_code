import { matchRoutes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { appRoutes } from './router';

function match(path: string) {
  return matchRoutes(appRoutes, path);
}

function lastMatch(path: string) {
  const matches = match(path);
  return matches ? matches[matches.length - 1] : null;
}

// docs/error-experience/spec.md: path:'*' → NotFoundPage (404 семантически
// «такой страницы нет», не «ошибка» — отдельно от errorElement) +
// errorElement на корневом роуте для непойманных исключений.
//
// docs/i18n-url-routing/spec.md §5: /:lang — родительский роут, валидирующий
// языковой сегмент РАНТАЙМ-проверкой внутри LocaleLayout (isSupportedUrlLang),
// не через саму структуру дерева роутов. matchRoutes видит только форму
// дерева — что реально рендерится (NotFoundPage при невалидном :lang) звёздным
// образом проверяется отдельно в LocaleLayout.test.tsx, не здесь.
describe('appRoutes error architecture', () => {
  it('resolves a single-segment path (not a known literal) to the /:lang index — LocaleLayout decides validity at runtime', () => {
    const last = lastMatch('/this-page-does-not-exist');
    expect(last?.route.index).toBe(true);
    expect(last?.params.lang).toBe('this-page-does-not-exist');
  });

  it('resolves a deeply nested unknown path under an (invalid) lang segment to the /:lang catch-all', () => {
    expect(lastMatch('/a/b/c/d')?.route.path).toBe('*');
  });

  it('resolves a deeply nested unknown path under a VALID lang segment to the same catch-all', () => {
    expect(lastMatch('/en/b/c/d')?.route.path).toBe('*');
  });

  it('defines an errorElement on a pathless child route, not the root layout route', () => {
    // Не на appRoutes[0] (RootLayout/Header) — иначе при краше errorElement
    // заменил бы весь родительский элемент целиком, стерев Header вместе с
    // остальной хромом сайта. См. комментарий в router.tsx.
    const root = appRoutes[0];
    expect(root.errorElement).toBeUndefined();
    expect(root.children?.[0]?.errorElement).toBeTruthy();
  });
});

describe('локализованные роуты (/:lang/*)', () => {
  it('/en/explore резолвится в реальный ExplorePage под /:lang, не в legacy-редирект', () => {
    const matches = match('/en/explore');
    expect(matches?.[matches.length - 1]?.route.path).toBe('explore');
    // Глубина 4: '/' → pathless(errorElement) → ':lang' → 'explore'
    // (у legacy '/explore' глубина 3 — см. следующий describe)
    expect(matches).toHaveLength(4);
    expect(matches?.[matches.length - 1]?.params.lang).toBe('en');
  });

  it('/ru/search и /sr-latn/main резолвятся под своим :lang', () => {
    expect(lastMatch('/ru/search')?.params.lang).toBe('ru');
    expect(lastMatch('/sr-latn/main')?.params.lang).toBe('sr-latn');
  });

  it('/en/article/123 резолвится и сохраняет :id', () => {
    const last = lastMatch('/en/article/123');
    expect(last?.route.path).toBe('article/:id');
    expect(last?.params.id).toBe('123');
  });

  it('/:lang index (голый /en) резолвится в index-роут (LangIndexRedirect)', () => {
    expect(lastMatch('/en')?.route.index).toBe(true);
  });

  it('/en/profile защищён PrivateRoute (pathless родитель без своего path)', () => {
    const matches = match('/en/profile');
    const profileMatch = matches?.[matches.length - 1];
    const privateRouteMatch = matches?.[matches.length - 2];
    expect(profileMatch?.route.path).toBe('profile');
    expect(privateRouteMatch?.route.path).toBeUndefined();
  });
});

describe('legacy bare-пути — редирект на /en/... (docs/i18n-url-routing/spec.md §3)', () => {
  it.each([
    ['/explore', 'explore'],
    ['/auth', 'auth'],
    ['/profile', 'profile'],
    ['/article/123', 'article/:id'],
    ['/forgot-password', 'forgot-password'],
  ])('%s резолвится в top-level legacy-роут (не в /:lang-поддерево)', (path, expectedPath) => {
    const matches = match(path);
    const last = matches?.[matches.length - 1];
    expect(last?.route.path).toBe(expectedPath);
    // Глубина 3 (без :lang) — отличает legacy-роут от его /:lang-аналога (глубина 4)
    expect(matches).toHaveLength(3);
  });
});

describe('исключения из локализации (docs/i18n-url-routing/spec.md §7)', () => {
  it('/auth/callback и /reset-password резолвятся без /:lang-префикса', () => {
    expect(lastMatch('/auth/callback')?.route.path).toBe('auth/callback');
    expect(lastMatch('/reset-password')?.route.path).toBe('reset-password');
  });
});

describe('голый /', () => {
  it('резолвится в index-роут (RootRedirect)', () => {
    expect(lastMatch('/')?.route.index).toBe(true);
  });
});
