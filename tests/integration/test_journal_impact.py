"""Интеграционные тесты GET /articles/stats/journal-impact (SQLite, без requires_pg).

Journal Landscape Scatter — docs/explore-table-builder/spec.md §1. Эндпоинт не кэшируется
(в отличие от /articles/stats), поэтому фикстуры client/db_session из conftest.py
используются без переопределения get_catalog_service (redis не участвует в этом пути).
"""

import datetime

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.article import Article
from app.models.article import Article as A
from app.models.catalog_article import CatalogArticle


async def _seed(session: AsyncSession, articles: list[dict]) -> None:
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


def _repeat(n: int, **kwargs) -> list[dict]:
    return [dict(kwargs) for _ in range(n)]


@pytest.mark.asyncio
async def test_journal_impact_excludes_journal_below_min_count(client: AsyncClient, db_session: AsyncSession):
    """Журнал с < 20 статьями не должен попасть в ответ (шумная выборка)."""
    articles = _repeat(19, journal="TooSmall", publication_date=datetime.date(2023, 1, 1))
    articles += _repeat(20, journal="JustEnough", publication_date=datetime.date(2023, 1, 1))
    await _seed(db_session, articles)

    resp = await client.get("/articles/stats/journal-impact", params={"max_year": 2024})
    assert resp.status_code == 200
    journals = {row["journal"] for row in resp.json()}

    assert "TooSmall" not in journals
    assert "JustEnough" in journals


@pytest.mark.asyncio
async def test_journal_impact_excludes_articles_after_max_year(client: AsyncClient, db_session: AsyncSession):
    """Статьи новее max_year не должны учитываться ни в объёме, ни в среднем цитировании."""
    articles = _repeat(20, journal="J", publication_date=datetime.date(2022, 1, 1), cited_by_count=10)
    articles += _repeat(5, journal="J", publication_date=datetime.date(2025, 1, 1), cited_by_count=0)
    await _seed(db_session, articles)

    resp = await client.get("/articles/stats/journal-impact", params={"max_year": 2022})
    assert resp.status_code == 200
    rows = {row["journal"]: row for row in resp.json()}

    assert rows["J"]["count"] == 20
    assert rows["J"]["mean_citations"] == 10.0


@pytest.mark.asyncio
async def test_journal_impact_computes_mean_and_median(client: AsyncClient, db_session: AsyncSession):
    # 19 статей с 0 цитирований + 1 статья с 200 — mean тянет выброс, median остаётся 0
    articles = _repeat(19, journal="Skewed", publication_date=datetime.date(2023, 1, 1), cited_by_count=0)
    articles += _repeat(1, journal="Skewed", publication_date=datetime.date(2023, 1, 1), cited_by_count=200)
    await _seed(db_session, articles)

    resp = await client.get("/articles/stats/journal-impact", params={"max_year": 2024})
    row = next(r for r in resp.json() if r["journal"] == "Skewed")

    assert row["count"] == 20
    assert row["mean_citations"] == 10.0
    assert row["median_citations"] == 0.0


@pytest.mark.asyncio
async def test_journal_impact_ordered_by_count_desc(client: AsyncClient, db_session: AsyncSession):
    articles = _repeat(20, journal="Small", publication_date=datetime.date(2023, 1, 1))
    articles += _repeat(30, journal="Big", publication_date=datetime.date(2023, 1, 1))
    await _seed(db_session, articles)

    resp = await client.get("/articles/stats/journal-impact", params={"max_year": 2024})
    journals_in_order = [row["journal"] for row in resp.json()]

    assert journals_in_order.index("Big") < journals_in_order.index("Small")


@pytest.mark.parametrize("max_year", [2021, 2025])
@pytest.mark.asyncio
async def test_journal_impact_rejects_max_year_outside_allowed_range(client: AsyncClient, max_year: int):
    """Слайдер окна зрелости ограничен 2022-2024 (docs/explore-table-builder/spec.md §1.1)."""
    resp = await client.get("/articles/stats/journal-impact", params={"max_year": max_year})
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_journal_impact_empty_catalog_returns_empty_list(client: AsyncClient):
    resp = await client.get("/articles/stats/journal-impact", params={"max_year": 2024})
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_journal_impact_default_max_year_is_2024(client: AsyncClient, db_session: AsyncSession):
    articles = _repeat(20, journal="J2024", publication_date=datetime.date(2024, 1, 1))
    articles += _repeat(20, journal="J2025-excluded", publication_date=datetime.date(2025, 1, 1))
    await _seed(db_session, articles)

    resp = await client.get("/articles/stats/journal-impact")  # без max_year — дефолт 2024
    assert resp.status_code == 200
    journals = {row["journal"] for row in resp.json()}

    assert "J2024" in journals
    assert "J2025-excluded" not in journals
