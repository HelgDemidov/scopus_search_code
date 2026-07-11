"""Интеграционные тесты GET /articles/stats/pivot (SQLite, без requires_pg).

Table Builder — docs/explore-table-builder/spec.md §3. Как и journal-impact,
эндпоинт не кэшируется — фикстуры client/db_session без переопределения get_catalog_service.
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


# ---------------------------------------------------------------------------
# Whitelist / валидация (security)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_pivot_rejects_dimension_outside_whitelist(client: AsyncClient):
    """'author' сознательно исключён из PivotDimension (риск ложной агрегации, spec.md §3.1)."""
    resp = await client.get("/articles/stats/pivot", params={"row_dim": "author", "col_dim": "country"})
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_pivot_rejects_arbitrary_string_dimension(client: AsyncClient):
    """Произвольная строка (потенциальная попытка инъекции через имя колонки) — 422, не 500."""
    resp = await client.get(
        "/articles/stats/pivot", params={"row_dim": "id; DROP TABLE articles;--", "col_dim": "country"}
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_pivot_rejects_same_row_and_col_dim(client: AsyncClient):
    resp = await client.get("/articles/stats/pivot", params={"row_dim": "country", "col_dim": "country"})
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_pivot_requires_filter_value_when_filter_dim_given(client: AsyncClient):
    resp = await client.get(
        "/articles/stats/pivot",
        params={"row_dim": "year", "col_dim": "country", "filter_dim": "doc_type"},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_pivot_rejects_filter_dim_equal_to_row_or_col(client: AsyncClient):
    resp = await client.get(
        "/articles/stats/pivot",
        params={"row_dim": "year", "col_dim": "country", "filter_dim": "year", "filter_value": "2024"},
    )
    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# Корректность агрегации
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_pivot_computes_correct_matrix(client: AsyncClient, db_session: AsyncSession):
    articles = _repeat(3, affiliation_country="USA", document_type="Article")
    articles += _repeat(2, affiliation_country="USA", document_type="Review")
    articles += _repeat(1, affiliation_country="China", document_type="Article")
    await _seed(db_session, articles)

    resp = await client.get("/articles/stats/pivot", params={"row_dim": "country", "col_dim": "doc_type"})
    assert resp.status_code == 200
    data = resp.json()

    row_usa = data["row_labels"].index("USA")
    col_article = data["col_labels"].index("Article")
    col_review = data["col_labels"].index("Review")
    assert data["matrix"][row_usa][col_article] == 3
    assert data["matrix"][row_usa][col_review] == 2

    row_china = data["row_labels"].index("China")
    assert data["matrix"][row_china][col_article] == 1
    # Китай не публиковал Review — ячейка должна быть 0, не отсутствовать
    assert data["matrix"][row_china][col_review] == 0


@pytest.mark.asyncio
async def test_pivot_top_n_rows_truncates_by_volume(client: AsyncClient, db_session: AsyncSession):
    articles: list[dict] = []
    for idx in range(5):
        articles += _repeat(10 - idx, affiliation_country=f"C{idx}", document_type="Article")
    await _seed(db_session, articles)

    resp = await client.get(
        "/articles/stats/pivot",
        params={"row_dim": "country", "col_dim": "doc_type", "top_n_rows": 3},
    )
    data = resp.json()

    assert len(data["row_labels"]) == 3
    assert set(data["row_labels"]) == {"C0", "C1", "C2"}


@pytest.mark.asyncio
async def test_pivot_slicer_filters_results(client: AsyncClient, db_session: AsyncSession):
    articles = _repeat(3, affiliation_country="USA", document_type="Article", open_access=True)
    articles += _repeat(2, affiliation_country="USA", document_type="Article", open_access=False)
    await _seed(db_session, articles)

    resp = await client.get(
        "/articles/stats/pivot",
        params={
            "row_dim": "country",
            "col_dim": "doc_type",
            "filter_dim": "open_access",
            "filter_value": "true",
        },
    )
    data = resp.json()

    row_usa = data["row_labels"].index("USA")
    col_article = data["col_labels"].index("Article")
    assert data["matrix"][row_usa][col_article] == 3


@pytest.mark.asyncio
async def test_pivot_empty_catalog_returns_empty_lists(client: AsyncClient):
    resp = await client.get("/articles/stats/pivot", params={"row_dim": "year", "col_dim": "country"})
    assert resp.status_code == 200
    data = resp.json()

    assert data["row_labels"] == []
    assert data["matrix"] == []


# ---------------------------------------------------------------------------
# metric=avg_citations (docs/impact-analytics/spec.md §1)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_pivot_rejects_invalid_metric(client: AsyncClient):
    resp = await client.get(
        "/articles/stats/pivot",
        params={"row_dim": "year", "col_dim": "country", "metric": "median"},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_pivot_avg_citations_happy_path(client: AsyncClient, db_session: AsyncSession):
    articles = _repeat(2, affiliation_country="USA", document_type="Article", cited_by_count=10)
    articles += _repeat(1, affiliation_country="USA", document_type="Article", cited_by_count=40)
    articles += _repeat(1, affiliation_country="China", document_type="Article", cited_by_count=6)
    await _seed(db_session, articles)

    resp = await client.get(
        "/articles/stats/pivot",
        params={"row_dim": "country", "col_dim": "doc_type", "metric": "avg_citations"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["metric"] == "avg_citations"

    row_usa = data["row_labels"].index("USA")
    col_article = data["col_labels"].index("Article")
    row_china = data["row_labels"].index("China")

    # (10 + 10 + 40) / 3 = 20.0
    assert data["matrix"][row_usa][col_article] == pytest.approx(20.0)
    assert data["cell_counts"][row_usa][col_article] == 3
    assert data["matrix"][row_china][col_article] == pytest.approx(6.0)
    assert data["cell_counts"][row_china][col_article] == 1


@pytest.mark.asyncio
async def test_pivot_cell_counts_unaffected_by_metric(client: AsyncClient, db_session: AsyncSession):
    articles = _repeat(3, affiliation_country="USA", document_type="Article", cited_by_count=5)
    await _seed(db_session, articles)

    params = {"row_dim": "country", "col_dim": "doc_type"}
    resp_count = await client.get("/articles/stats/pivot", params={**params, "metric": "count"})
    resp_avg = await client.get("/articles/stats/pivot", params={**params, "metric": "avg_citations"})

    assert resp_count.json()["cell_counts"] == resp_avg.json()["cell_counts"]
    assert resp_count.json()["row_totals"] == resp_avg.json()["row_totals"]
    assert resp_count.json()["col_totals"] == resp_avg.json()["col_totals"]


@pytest.mark.asyncio
async def test_pivot_avg_citations_empty_cell_is_zero_not_missing(client: AsyncClient, db_session: AsyncSession):
    articles = _repeat(2, affiliation_country="USA", document_type="Article", cited_by_count=10)
    articles += _repeat(1, affiliation_country="China", document_type="Review", cited_by_count=3)
    await _seed(db_session, articles)

    resp = await client.get(
        "/articles/stats/pivot",
        params={"row_dim": "country", "col_dim": "doc_type", "metric": "avg_citations"},
    )
    data = resp.json()

    row_usa = data["row_labels"].index("USA")
    col_review = data["col_labels"].index("Review")
    # USA никогда не публиковала Review — ячейка должна быть (0.0, count=0), не отсутствовать
    assert data["matrix"][row_usa][col_review] == 0.0
    assert data["cell_counts"][row_usa][col_review] == 0
