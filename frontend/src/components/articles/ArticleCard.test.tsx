import { render, screen } from '@testing-library/react';
import { MemoryRouter, matchRoutes } from 'react-router-dom';
import { describe, it, expect } from 'vitest';
import { ArticleCard } from './ArticleCard';
import { appRoutes } from '../../router';
import type { ArticleResponse } from '../../types/api';

// Регрессионный тест на баг 2026-07-04: ArticleCard.tsx долгое время линковал
// на /articles/:id (мн. число), а App.tsx регистрировал /article/:id (ед. число) —
// клик по заголовку карточки вёл на 404. Рассинхронизация возникла в рефакторинге
// (commit ffdbbdfb) и не была поймана ни одним тестом, потому что все существующие
// тесты проверяют только рендеринг пропсов, а не то, резолвится ли реальный href
// в зарегистрированный маршрут.
//
// matchRoutes против appRoutes (единственный источник истины для App.tsx) гарантирует,
// что тест сломается, если Link и Route снова разъедутся в любую сторону.

const article: ArticleResponse = {
  id: 42,
  title: 'Test article title',
  author: 'Doe J.',
  journal: 'Journal of Testing',
  publication_date: '2024-01-01',
  doi: '10.1000/test',
  keyword: 'seeder_migration',
  cited_by_count: 5,
  document_type: 'Article',
  open_access: true,
  affiliation_country: 'United States',
};

describe('ArticleCard', () => {
  it('links to a path that resolves against a registered app route', () => {
    render(
      <MemoryRouter>
        <ArticleCard article={article} />
      </MemoryRouter>,
    );

    const link = screen.getByRole('link', { name: /test article title/i });
    const href = link.getAttribute('href');
    expect(href).toBeTruthy();

    const matches = matchRoutes(appRoutes, href as string);
    expect(matches).not.toBeNull();
  });
});
