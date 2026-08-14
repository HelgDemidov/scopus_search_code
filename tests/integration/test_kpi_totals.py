"""Интеграционные тесты GET /articles/stats/summary (SQLite, без requires_pg).

Быстрый фикс 2026-08-14 (см. память project-explore-charts-refactor /
docs/backend-performance/explore-kpi-summary/spec.md): 6 плиток KpiRow на /explore
раньше ждали весь GET /articles/stats — 10 последовательных агрегатов, ~9.7с
на холодном Redis-кэше (профилировано на проде, EXPLAIN ANALYZE подтвердил
CPU-bound, не cache-miss — тот же паттерн, что project-catalog-search-latency).
Плиткам нужны только 6 скаляров, все из ОДНОГО agg-запроса без DISTINCT-сортировок
по journal/author и без кросс-табов. Этот эндпоинт — тот единственный запрос.
"""

import datetime

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_catalog_service
from app.infrastructure.postgres_article_repo import PostgresArticleRepository
from app.infrastructure.postgres_catalog_repo import PostgresCatalogRepository
from app.main import app
from app.models.article import Article
from app.models.article import Article as A
from app.models.catalog_article import CatalogArticle
from app.services.catalog_service import CatalogService


@pytest_asyncio.fixture(autouse=True)
async def _bypass_real_redis_cache(db_session: AsyncSession):
    """См. test_stats_cross_analytics.py::_bypass_real_redis_cache — тот же общий
    Upstash Redis, тот же риск читать/писать чужой ключ без этого форса redis=None."""

    def _override() -> CatalogService:
        return CatalogService(
            article_repo=PostgresArticleRepository(db_session),
            catalog_repo=PostgresCatalogRepository(db_session),
            session=db_session,
            redis=None,
            db_namespace="",
        )

    app.dependency_overrides[get_catalog_service] = _override
    yield
    app.dependency_overrides.pop(get_catalog_service, None)


async def _seed(session: AsyncSession, articles: list[dict]) -> None:
    """Та же схема сидинга, что test_stats_cross_analytics.py."""
    for i, data in enumerate(articles):
        session.add(
            Article(
                title=data.get("title", f"Test Article {i}"),
                author=data.get("author", "Test Author"),
                doi=data.get("doi", f"10.test/{i}"),
                publication_date=data.get("publication_date", datetime.date(2023, 1, 1)),
                journal=data.get("journal", "Test Journal"),
                affiliation_country=data.get("affiliation_country"),
                document_type=data.get("document_type", "Article"),
                open_access=data.get("open_access", False),
                cited_by_count=data.get("cited_by_count", 0),
            )
        )
    await session.flush()

    result = await session.execute(select(A).order_by(A.id.desc()).limit(len(articles)))
    inserted = result.scalars().all()
    for article in inserted:
        session.add(CatalogArticle(article_id=article.id, keyword="test"))
    await session.commit()


@pytest.mark.asyncio
async def test_kpi_totals_counts_distinct_journals_countries_authors(
    client: AsyncClient, db_session: AsyncSession
):
    await _seed(
        db_session,
        [
            {"journal": "Nature", "author": "A. Smith", "affiliation_country": "USA"},
            {"journal": "Nature", "author": "B. Jones", "affiliation_country": "USA"},
            {"journal": "Science", "author": "A. Smith", "affiliation_country": "China"},
        ],
    )

    response = await client.get("/articles/stats/summary")

    assert response.status_code == 200
    data = response.json()
    assert data["total_articles"] == 3
    assert data["total_journals"] == 2  # Nature, Science
    assert data["total_countries"] == 2  # USA, China
    assert data["total_authors"] == 2  # A. Smith, B. Jones


@pytest.mark.asyncio
async def test_kpi_totals_counts_open_access(client: AsyncClient, db_session: AsyncSession):
    await _seed(
        db_session,
        [
            {"open_access": True},
            {"open_access": True},
            {"open_access": False},
        ],
    )

    response = await client.get("/articles/stats/summary")

    assert response.json()["open_access_count"] == 2


@pytest.mark.asyncio
async def test_kpi_totals_counts_distinct_doc_types(client: AsyncClient, db_session: AsyncSession):
    await _seed(
        db_session,
        [
            {"document_type": "Article"},
            {"document_type": "Article"},
            {"document_type": "Review"},
            {"document_type": "Book Chapter"},
        ],
    )

    response = await client.get("/articles/stats/summary")

    assert response.json()["total_doc_types"] == 3  # Article, Review, Book Chapter


@pytest.mark.asyncio
async def test_kpi_totals_empty_catalog_returns_zeros(client: AsyncClient):
    response = await client.get("/articles/stats/summary")

    assert response.status_code == 200
    data = response.json()
    assert data == {
        "total_articles": 0,
        "total_journals": 0,
        "total_countries": 0,
        "total_authors": 0,
        "open_access_count": 0,
        "total_doc_types": 0,
    }


@pytest.mark.asyncio
async def test_kpi_totals_matches_stats_totals(client: AsyncClient, db_session: AsyncSession):
    """Согласованность с GET /articles/stats — не отдельная, разъехавшаяся логика подсчёта."""
    await _seed(
        db_session,
        [
            {"journal": "Nature", "affiliation_country": "USA", "open_access": True, "document_type": "Article"},
            {
                "journal": "Science",
                "affiliation_country": "China",
                "open_access": False,
                "document_type": "Review",
            },
        ],
    )

    summary = (await client.get("/articles/stats/summary")).json()
    full = (await client.get("/articles/stats")).json()

    assert summary["total_articles"] == full["total_articles"]
    assert summary["total_journals"] == full["total_journals"]
    assert summary["total_countries"] == full["total_countries"]
    assert summary["total_authors"] == full["total_authors"]
    assert summary["open_access_count"] == full["open_access_count"]
    assert summary["total_doc_types"] == len(full["by_doc_type"])
