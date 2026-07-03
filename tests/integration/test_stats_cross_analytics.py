"""Интеграционные тесты кросс-агрегатов GET /articles/stats (SQLite, без requires_pg).

Покрывает 3 новых поля StatsResponse из docs/explore-cross-analytics/spec.md §2:
by_year_top_countries, sunburst_country_open_access, top_journals_by_country.
Запросы используют только .in_()/case()/extract() без func.lower() — в отличие
от test_stats_filtered.py (requires_pg), здесь SQLite-совместимость не проблема.
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
    """GET /articles/stats кэшируется в общем Upstash Redis (db_namespace=DATABASE_URL из
    .env, см. app/core/dependencies.get_catalog_service) — этот ключ ОДИН И ТОТ ЖЕ для всех
    тестов в рамках локального запуска, независимо от того, какая SQLite in-memory БД стоит
    за конкретным тестом. Без этой фикстуры тесты в этом файле либо читают чужой (реальный,
    production/staging) кэш вместо своей засеянной SQLite-фикстуры, либо пишут в него мусор
    с TTL=60с. Форсируем redis=None (уже поддерживаемый graceful-degradation путь,
    см. test_catalog_service.py::test_get_stats_no_redis_goes_directly_to_db) только для
    тестов этого файла — conftest.py и остальные тесты не трогаем."""

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
    """Вставляет статьи + регистрирует их в catalog_articles (та же схема, что test_stats_filtered.py)."""
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


# ---------------------------------------------------------------------------
# by_year_top_countries
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_by_year_top_countries_excludes_countries_outside_top10(
    client: AsyncClient, db_session: AsyncSession
):
    """11-я по объёму страна не должна попасть в by_year_top_countries."""
    articles: list[dict] = []
    # 10 стран с явно разным объёмом — гарантированный топ-10
    for idx, country in enumerate(["C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8", "C9", "C10"]):
        articles += _repeat(10 - idx, affiliation_country=country, publication_date=datetime.date(2024, 1, 1))
    # 11-я страна — заведомо меньше всех остальных, не должна пройти в топ-10
    articles += _repeat(1, affiliation_country="C11-excluded", publication_date=datetime.date(2024, 1, 1))
    await _seed(db_session, articles)

    resp = await client.get("/articles/stats")
    assert resp.status_code == 200
    data = resp.json()

    countries_in_result = {row["country"] for row in data["by_year_top_countries"]}
    assert "C11-excluded" not in countries_in_result
    assert countries_in_result == {f"C{i}" for i in range(1, 11)}


@pytest.mark.asyncio
async def test_by_year_top_countries_groups_by_year_and_country(client: AsyncClient, db_session: AsyncSession):
    await _seed(
        db_session,
        [
            {"affiliation_country": "USA", "publication_date": datetime.date(2023, 5, 1)},
            {"affiliation_country": "USA", "publication_date": datetime.date(2023, 6, 1)},
            {"affiliation_country": "USA", "publication_date": datetime.date(2024, 1, 1)},
        ],
    )

    resp = await client.get("/articles/stats")
    data = resp.json()

    rows = {(r["year"], r["country"]): r["count"] for r in data["by_year_top_countries"]}
    assert rows[(2023, "USA")] == 2
    assert rows[(2024, "USA")] == 1


# ---------------------------------------------------------------------------
# sunburst_country_open_access (упрощён до 2 уровней Country → OpenAccess
# по итогам визуального ревью — doc_type как промежуточный слой убран)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_sunburst_excludes_countries_outside_top5(client: AsyncClient, db_session: AsyncSession):
    articles: list[dict] = []
    for idx, country in enumerate(["C1", "C2", "C3", "C4", "C5"]):
        articles += _repeat(10 - idx, affiliation_country=country, open_access=True)
    articles += _repeat(1, affiliation_country="C6-excluded", open_access=True)
    await _seed(db_session, articles)

    resp = await client.get("/articles/stats")
    data = resp.json()

    countries_in_result = {row["country"] for row in data["sunburst_country_open_access"]}
    assert "C6-excluded" not in countries_in_result
    assert countries_in_result == {"C1", "C2", "C3", "C4", "C5"}


@pytest.mark.asyncio
async def test_sunburst_splits_by_open_access(client: AsyncClient, db_session: AsyncSession):
    await _seed(
        db_session,
        [
            {"affiliation_country": "USA", "open_access": True},
            {"affiliation_country": "USA", "open_access": True},
            {"affiliation_country": "USA", "open_access": False},
        ],
    )

    resp = await client.get("/articles/stats")
    data = resp.json()

    rows = {(r["country"], r["open_access"]): r["count"] for r in data["sunburst_country_open_access"]}
    assert rows[("USA", True)] == 2
    assert rows[("USA", False)] == 1


# ---------------------------------------------------------------------------
# top_journals_by_country
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_top_journals_by_country_excludes_journal_outside_top10(
    client: AsyncClient, db_session: AsyncSession
):
    articles: list[dict] = []
    for idx in range(10):
        articles += _repeat(20 - idx, affiliation_country="USA", journal=f"J{idx}")
    articles += _repeat(1, affiliation_country="USA", journal="J-excluded")
    await _seed(db_session, articles)

    resp = await client.get("/articles/stats")
    data = resp.json()

    journals_in_result = {row["journal"] for row in data["top_journals_by_country"]}
    assert "J-excluded" not in journals_in_result
    assert journals_in_result == {f"J{i}" for i in range(10)}


@pytest.mark.asyncio
async def test_top_journals_by_country_buckets_country_outside_top5_as_other(
    client: AsyncClient, db_session: AsyncSession
):
    """Страна вне глобального топ-5 должна попасть в 'Other' сегмент журнала, а не исчезнуть."""
    articles: list[dict] = []
    for idx, country in enumerate(["C1", "C2", "C3", "C4", "C5"]):
        articles += _repeat(10 - idx, affiliation_country=country, journal="SharedJournal")
    # Редкая страна вне топ-5 — не должна пропасть, а должна лечь в "Other" того же журнала
    articles += _repeat(1, affiliation_country="C6-rare", journal="SharedJournal")
    await _seed(db_session, articles)

    resp = await client.get("/articles/stats")
    data = resp.json()

    rows = {
        (r["journal"], r["country"]): r["count"]
        for r in data["top_journals_by_country"]
        if r["journal"] == "SharedJournal"
    }
    assert ("SharedJournal", "C6-rare") not in rows
    assert rows[("SharedJournal", "Other")] == 1


# ---------------------------------------------------------------------------
# Пустой каталог — все 3 новых поля пустые списки, без ошибок
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_empty_catalog_returns_empty_cross_analytics_lists(client: AsyncClient):
    resp = await client.get("/articles/stats")
    assert resp.status_code == 200
    data = resp.json()

    assert data["by_year_top_countries"] == []
    assert data["sunburst_country_open_access"] == []
    assert data["top_journals_by_country"] == []
