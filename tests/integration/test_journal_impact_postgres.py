"""PostgreSQL-only тесты GET /articles/stats/journal-impact — percentile_cont-путь.

test_journal_impact.py (SQLite) покрывает контракт эндпоинта, но всегда идёт по
Python-фолбэку get_journal_impact (statistics.median) — dialect-check пропускает
SQLite мимо ветки с func.percentile_cont(). Эта ветка нигде больше не проверяется,
поэтому здесь — отдельный requires_pg файл (тот же принцип, что
test_find_articles_postgres.py для advisory-lock конкурентности).

Skipped if DATABASE_TEST_URL не задан (см. tests/integration/conftest.py::pg_engine).
"""

import datetime

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_catalog_service
from app.infrastructure.postgres_article_repo import PostgresArticleRepository
from app.infrastructure.postgres_catalog_repo import PostgresCatalogRepository
from app.main import app
from app.models.article import Article
from app.models.catalog_article import CatalogArticle
from app.services.catalog_service import CatalogService


@pytest_asyncio.fixture(autouse=True)
async def _bypass_real_redis_cache(pg_session: AsyncSession):
    """Тот же обязательный оверрайд, что в test_journal_impact.py (SQLite) — без него
    percentile_cont-путь читал/писал бы реальный production/staging Redis-ключ."""

    def _override() -> CatalogService:
        return CatalogService(
            article_repo=PostgresArticleRepository(pg_session),
            catalog_repo=PostgresCatalogRepository(pg_session),
            session=pg_session,
            redis=None,
            db_namespace="",
        )

    app.dependency_overrides[get_catalog_service] = _override
    yield
    app.dependency_overrides.pop(get_catalog_service, None)


async def _seed(session: AsyncSession, articles: list[dict]) -> None:
    inserted = []
    for i, data in enumerate(articles):
        article = Article(
            title=data.get("title", f"Test Article {i}"),
            author=data.get("author", "Test Author"),
            doi=data.get("doi", f"10.pgtest/{i}"),
            publication_date=data.get("publication_date", datetime.date(2023, 1, 1)),
            journal=data.get("journal", "Test Journal"),
            document_type=data.get("document_type", "Article"),
            open_access=data.get("open_access", False),
            cited_by_count=data.get("cited_by_count", 0),
        )
        session.add(article)
        inserted.append(article)
    await session.flush()

    for article in inserted:
        session.add(CatalogArticle(article_id=article.id, keyword="test"))
    await session.commit()


@pytest.mark.asyncio
@pytest.mark.requires_pg
async def test_percentile_cont_matches_python_median_on_skewed_data(
    pg_client: AsyncClient, pg_session: AsyncSession
):
    """Тот же скошенный сценарий, что test_journal_impact_computes_mean_and_median
    (SQLite) — 19 статей с 0 цитирований + 1 с 200: mean тянет выброс, median = 0.
    Подтверждает, что percentile_cont(0.5) на Postgres даёт то же число, что
    Python statistics.median на SQLite — не два разных определения медианы."""
    articles = [
        {"journal": "Skewed", "cited_by_count": 0, "publication_date": datetime.date(2023, 1, 1)}
        for _ in range(19)
    ]
    articles.append({"journal": "Skewed", "cited_by_count": 200, "publication_date": datetime.date(2023, 1, 1)})
    await _seed(pg_session, articles)

    resp = await pg_client.get("/articles/stats/journal-impact", params={"max_year": 2024})
    assert resp.status_code == 200
    row = next(r for r in resp.json() if r["journal"] == "Skewed")

    assert row["count"] == 20
    assert row["mean_citations"] == 10.0
    assert row["median_citations"] == 0.0


@pytest.mark.asyncio
@pytest.mark.requires_pg
async def test_percentile_cont_treats_null_cited_by_count_as_zero(
    pg_client: AsyncClient, pg_session: AsyncSession
):
    """cited_by_count нередко NULL (Scopus free-tier — не для всех статей есть
    наукометрия). coalesce(cited_by_count, 0) внутри percentile_cont обязан вести
    себя как Python-фолбэк (r.cited_by_count or 0), иначе медиана молча
    разошлась бы между Postgres и SQLite-путём на одинаковых данных."""
    articles = [{"journal": "HasNulls", "cited_by_count": None} for _ in range(15)]
    articles += [{"journal": "HasNulls", "cited_by_count": 5} for _ in range(5)]
    await _seed(pg_session, articles)

    resp = await pg_client.get("/articles/stats/journal-impact", params={"max_year": 2024})
    assert resp.status_code == 200
    row = next(r for r in resp.json() if r["journal"] == "HasNulls")

    assert row["count"] == 20
    # 15×0 (coalesce от NULL) + 5×5 — медиана 20 значений, отсортированных, = 0.0
    assert row["median_citations"] == 0.0
