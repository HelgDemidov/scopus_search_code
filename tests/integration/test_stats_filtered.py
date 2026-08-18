"""Интеграционные тесты для GET /articles/stats с фильтрами (Cross-filter V2 backend).

Все тесты требуют PostgreSQL: func.lower().in_() не работает корректно в SQLite
при кросс-платформенной коллации.
"""

import datetime

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.article import Article
from app.models.catalog_article import CatalogArticle

# ---------------------------------------------------------------------------
# Хелпер: вставить статьи в БД и зарегистрировать в catalog_articles
# ---------------------------------------------------------------------------


async def _seed(session: AsyncSession, articles: list[dict]) -> None:
    """Вставить статьи + catalog_articles. flush без commit — транзакция теста."""
    for i, data in enumerate(articles):
        article = Article(
            title=data.get("title", f"Test Article {i}"),
            author=data.get("author", "Test Author"),
            doi=data.get("doi", f"10.test/{i}"),
            publication_date=data.get("publication_date", datetime.date(2023, 1, 1)),
            journal=data.get("journal", "Test Journal"),
            affiliation_country=data.get("affiliation_country"),
            document_type=data.get("document_type", "Article"),
            open_access=data.get("open_access", False),
        )
        session.add(article)

    await session.flush()

    # Получаем вставленные статьи чтобы узнать их id
    from sqlalchemy import select

    from app.models.article import Article as A

    result = await session.execute(select(A).order_by(A.id.desc()).limit(len(articles)))
    inserted = result.scalars().all()

    for article in inserted:
        session.add(CatalogArticle(article_id=article.id, keyword="test"))

    await session.commit()


# ---------------------------------------------------------------------------
# Тесты
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.requires_pg
async def test_stats_unfiltered_returns_all(pg_client: AsyncClient, pg_session: AsyncSession):
    """Без фильтров /stats возвращает total_articles == общему числу статей в каталоге."""
    await _seed(
        pg_session,
        [
            {"doi": "10.u/1", "affiliation_country": "China", "document_type": "Article"},
            {"doi": "10.u/2", "affiliation_country": "USA", "document_type": "Review"},
            {"doi": "10.u/3", "affiliation_country": "Germany", "document_type": "Article"},
        ],
    )

    resp = await pg_client.get("/articles/stats")
    assert resp.status_code == 200, resp.text

    data = resp.json()
    assert data["total_articles"] == 3


@pytest.mark.asyncio
@pytest.mark.requires_pg
async def test_stats_filtered_by_country(pg_client: AsyncClient, pg_session: AsyncSession):
    """Фильтр countries[] уменьшает total_articles и by_country."""
    await _seed(
        pg_session,
        [
            {"doi": "10.c/1", "affiliation_country": "China"},
            {"doi": "10.c/2", "affiliation_country": "China"},
            {"doi": "10.c/3", "affiliation_country": "USA"},
        ],
    )

    resp = await pg_client.get("/articles/stats", params={"countries": ["China"]})
    assert resp.status_code == 200, resp.text

    data = resp.json()
    assert data["total_articles"] == 2, f"Ожидали 2, получили {data['total_articles']}"

    # by_country в отфильтрованных данных должен содержать только China
    country_labels = [item["label"] for item in data["by_country"]]
    assert "China" in country_labels
    assert "USA" not in country_labels


@pytest.mark.asyncio
@pytest.mark.requires_pg
async def test_stats_filtered_by_doc_type(pg_client: AsyncClient, pg_session: AsyncSession):
    """Фильтр doc_types[] уменьшает total_articles и by_doc_type."""
    await _seed(
        pg_session,
        [
            {"doi": "10.d/1", "document_type": "Article"},
            {"doi": "10.d/2", "document_type": "Article"},
            {"doi": "10.d/3", "document_type": "Review"},
        ],
    )

    resp = await pg_client.get("/articles/stats", params={"doc_types": ["Review"]})
    assert resp.status_code == 200, resp.text

    data = resp.json()
    assert data["total_articles"] == 1, f"Ожидали 1, получили {data['total_articles']}"

    doc_labels = [item["label"] for item in data["by_doc_type"]]
    assert "Review" in doc_labels
    assert "Article" not in doc_labels


# ---------------------------------------------------------------------------
# Регрессия на механику GROUPING SETS (Фаза A,
# docs/backend-performance/explore-stats-consolidation/spec.md) — не только контракт,
# а конкретные риски объединения 6 запросов в один: NULL в одном измерении не должен
# просачиваться в соседние, топ-20 должен работать корректно, by_year не должен
# случайно ограничиться тем же лимитом.
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.requires_pg
async def test_stats_null_journal_counted_in_totals_but_excluded_from_by_journal(
    pg_client: AsyncClient, pg_session: AsyncSession
):
    """Статья с journal=None: total_articles учитывает её, by_journal — нет.

    Раньше это гарантировал отдельный .where(journal.isnot(None)) в собственном
    запросе по журналам. В GROUPING SETS WHERE до агрегации исключил бы строку
    из totals/by_year/by_country/by_doc_type тоже — фильтр применяется только
    к "своей" группировке post-hoc (см. _get_stats_grouping_sets_pg)."""
    await _seed(
        pg_session,
        [
            {"doi": "10.j/1", "journal": "Known Journal"},
            {"doi": "10.j/2", "journal": None},
        ],
    )

    resp = await pg_client.get("/articles/stats")
    assert resp.status_code == 200, resp.text
    data = resp.json()

    assert data["total_articles"] == 2, "статья с journal=None должна учитываться в totals"

    journal_labels = [item["label"] for item in data["by_journal"]]
    assert journal_labels == ["Known Journal"], "None не должен появляться как отдельный журнал"


@pytest.mark.asyncio
@pytest.mark.requires_pg
async def test_stats_by_journal_caps_at_top20_by_count(pg_client: AsyncClient, pg_session: AsyncSession):
    """25 разных журналов → by_journal возвращает ровно топ-20 по числу статей."""
    articles = []
    for i in range(25):
        # journal_00 получает 25 статей, journal_24 — 1 статью — однозначный порядок топ-20
        articles.extend({"doi": f"10.j25/{i}-{n}", "journal": f"journal_{i:02d}"} for n in range(25 - i))
    await _seed(pg_session, articles)

    resp = await pg_client.get("/articles/stats")
    assert resp.status_code == 200, resp.text
    data = resp.json()

    assert len(data["by_journal"]) == 20, f"Ожидали ровно 20, получили {len(data['by_journal'])}"
    labels = [item["label"] for item in data["by_journal"]]
    expected = [f"journal_{i:02d}" for i in range(20)]
    assert labels == expected, "топ-20 должны быть самые частые журналы, по убыванию"


@pytest.mark.asyncio
@pytest.mark.requires_pg
async def test_stats_by_year_not_capped_at_20(pg_client: AsyncClient, pg_session: AsyncSession):
    """25 разных лет публикации → by_year возвращает все 25, без потолка топ-20
    (в отличие от by_journal/by_country/top_authors — у by_year в прежнем коде
    не было .limit(), регрессия здесь означала бы случайно урезанный график)."""
    articles = [{"doi": f"10.y25/{i}", "publication_date": datetime.date(2000 + i, 1, 1)} for i in range(25)]
    await _seed(pg_session, articles)

    resp = await pg_client.get("/articles/stats")
    assert resp.status_code == 200, resp.text
    data = resp.json()

    assert len(data["by_year"]) == 25, f"Ожидали все 25 лет, получили {len(data['by_year'])}"
