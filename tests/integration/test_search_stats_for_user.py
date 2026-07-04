"""Первое тестовое покрытие get_search_stats_for_user (docs/personal-search-data/spec.md §2).

Метод существовал до этого тикета (используется /articles/search/stats на HomePage),
но не имел ни одного теста, кроме Fake-заглушки в test_search_service.py — ветка
search=None не выполнялась и не была протестирована никогда (используется теперь
GET /articles/stats/personal — источник инфографики /explore?mode=personal).

SQLite (db_session/client/authenticated_client из tests/conftest.py) — репозиторий
не использует PG-специфичный SQL, requires_pg не нужен.
"""

import datetime
from datetime import date, timedelta, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.postgres_search_result_repo import PostgresSearchResultRepository
from app.models.article import Article
from app.models.search_history import SearchHistory
from app.models.search_result_article import SearchResultArticle

_doi_counter = 0


async def _seed_search(
    session: AsyncSession,
    user_id: int,
    query: str,
    articles_data: list[dict],
    created_at: datetime.datetime | None = None,
) -> int:
    """Создаёт SearchHistory + Article(и) + SearchResultArticle, возвращает search_history_id."""
    global _doi_counter

    history = SearchHistory(
        user_id=user_id,
        query=query,
        result_count=len(articles_data),
        filters={},
        created_at=created_at or datetime.datetime.now(tz=timezone.utc),
    )
    session.add(history)
    await session.flush()

    articles = []
    for data in articles_data:
        _doi_counter += 1
        a = Article(
            title=data.get("title", f"Title {_doi_counter}"),
            author=data.get("author", "Author"),
            doi=data.get("doi", f"10.test/{_doi_counter}"),
            publication_date=data.get("publication_date", date(2023, 1, 1)),
            journal=data.get("journal"),
            affiliation_country=data.get("affiliation_country"),
            document_type=data.get("document_type"),
            open_access=data.get("open_access"),
            cited_by_count=data.get("cited_by_count"),
        )
        session.add(a)
        articles.append(a)
    await session.flush()

    for rank, a in enumerate(articles):
        session.add(SearchResultArticle(search_history_id=history.id, article_id=a.id, rank=rank))
    await session.commit()
    return history.id


def _counts(rows: list[dict], key: str) -> dict:
    return {r[key]: r["count"] for r in rows}


# ---------------------------------------------------------------------------
# Базовые агрегаты
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_total_and_by_year(db_session: AsyncSession):
    repo = PostgresSearchResultRepository(db_session)
    await _seed_search(
        db_session,
        user_id=1,
        query="AI",
        articles_data=[
            {"publication_date": date(2023, 1, 1)},
            {"publication_date": date(2023, 6, 1)},
            {"publication_date": date(2024, 1, 1)},
        ],
    )

    data = await repo.get_search_stats_for_user(user_id=1)

    assert data["total"] == 3
    assert _counts(data["by_year"], "year") == {2023: 2, 2024: 1}


@pytest.mark.asyncio
async def test_by_country_and_doc_type_and_journal(db_session: AsyncSession):
    repo = PostgresSearchResultRepository(db_session)
    await _seed_search(
        db_session,
        user_id=1,
        query="AI",
        articles_data=[
            {"affiliation_country": "Germany", "document_type": "Article", "journal": "J1"},
            {"affiliation_country": "Germany", "document_type": "Review", "journal": "J1"},
            {"affiliation_country": "France", "document_type": "Article", "journal": "J2"},
        ],
    )

    data = await repo.get_search_stats_for_user(user_id=1)

    assert _counts(data["by_country"], "country") == {"Germany": 2, "France": 1}
    assert _counts(data["by_doc_type"], "doc_type") == {"Article": 2, "Review": 1}
    assert _counts(data["by_journal"], "journal") == {"J1": 2, "J2": 1}


@pytest.mark.asyncio
async def test_by_open_access_two_buckets(db_session: AsyncSession):
    """Новое измерение docs/personal-search-data/spec.md §2.1."""
    repo = PostgresSearchResultRepository(db_session)
    await _seed_search(
        db_session,
        user_id=1,
        query="AI",
        articles_data=[
            {"open_access": True},
            {"open_access": True},
            {"open_access": False},
        ],
    )

    data = await repo.get_search_stats_for_user(user_id=1)

    assert _counts(data["by_open_access"], "open_access") == {True: 2, False: 1}


@pytest.mark.asyncio
async def test_null_fields_excluded_from_grouped_dimensions(db_session: AsyncSession):
    """Статья без journal/country/doc_type/open_access не попадает в соответствующий бакет,
    но учитывается в total и by_year."""
    repo = PostgresSearchResultRepository(db_session)
    await _seed_search(
        db_session,
        user_id=1,
        query="AI",
        articles_data=[{"journal": None, "affiliation_country": None, "document_type": None, "open_access": None}],
    )

    data = await repo.get_search_stats_for_user(user_id=1)

    assert data["total"] == 1
    assert data["by_journal"] == []
    assert data["by_country"] == []
    assert data["by_doc_type"] == []
    assert data["by_open_access"] == []


# ---------------------------------------------------------------------------
# Дедупликация статей между поисками одного пользователя
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_same_article_found_in_two_searches_counted_once(db_session: AsyncSession):
    repo = PostgresSearchResultRepository(db_session)
    # Одна и та же статья (общий doi) — результат двух разных поисков пользователя
    shared_doi = "10.test/shared"
    await _seed_search(db_session, user_id=1, query="AI", articles_data=[{"doi": shared_doi}])
    # Второй поиск ссылается на ТУ ЖЕ статью — нужно вручную создать SearchResultArticle
    # на существующий article_id, не через _seed_search (который всегда создаёт новую статью)
    history2 = SearchHistory(user_id=1, query="machine learning", result_count=1, filters={})
    db_session.add(history2)
    await db_session.flush()

    existing = (await db_session.execute(select(Article).where(Article.doi == shared_doi))).scalar_one()
    db_session.add(SearchResultArticle(search_history_id=history2.id, article_id=existing.id, rank=0))
    await db_session.commit()

    data = await repo.get_search_stats_for_user(user_id=1)

    assert data["total"] == 1  # не 2 — дедуп по Article.id


# ---------------------------------------------------------------------------
# Изоляция между пользователями (security-critical)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_other_users_articles_excluded(db_session: AsyncSession):
    repo = PostgresSearchResultRepository(db_session)
    await _seed_search(db_session, user_id=1, query="mine", articles_data=[{}])
    await _seed_search(db_session, user_id=2, query="not-mine", articles_data=[{}, {}])

    data = await repo.get_search_stats_for_user(user_id=1)

    assert data["total"] == 1


# ---------------------------------------------------------------------------
# search=None (полная история) vs search="keyword" (ILIKE по title/author)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_search_filter_ilike_matches_title_or_author(db_session: AsyncSession):
    repo = PostgresSearchResultRepository(db_session)
    await _seed_search(
        db_session,
        user_id=1,
        query="q",
        articles_data=[
            {"title": "Neural networks in medicine", "author": "Smith"},
            {"title": "Climate change", "author": "Neural Jones"},
            {"title": "Unrelated topic", "author": "Doe"},
        ],
    )

    data = await repo.get_search_stats_for_user(user_id=1, search="neural")

    assert data["total"] == 2  # заголовок ИЛИ автор содержит "neural" (регистронезависимо)


@pytest.mark.asyncio
async def test_since_filter_excludes_older_searches(db_session: AsyncSession):
    repo = PostgresSearchResultRepository(db_session)
    now = datetime.datetime.now(tz=timezone.utc)
    await _seed_search(db_session, user_id=1, query="old", articles_data=[{}], created_at=now - timedelta(days=10))
    await _seed_search(db_session, user_id=1, query="new", articles_data=[{}], created_at=now - timedelta(days=1))

    data = await repo.get_search_stats_for_user(user_id=1, since=now - timedelta(days=7))

    assert data["total"] == 1


# ---------------------------------------------------------------------------
# Пустая история
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_empty_history_returns_zeros(db_session: AsyncSession):
    repo = PostgresSearchResultRepository(db_session)

    data = await repo.get_search_stats_for_user(user_id=1)

    assert data["total"] == 0
    assert data["by_year"] == []
    assert data["by_journal"] == []
    assert data["by_country"] == []
    assert data["by_doc_type"] == []
    assert data["by_open_access"] == []


# ---------------------------------------------------------------------------
# Роутер: GET /articles/search/stats (существующий эндпоинт — не имел тестов
# до этого тикета; проверяем, что рефакторинг ответа на _to_search_stats_response
# его не сломал, заодно закрываем пробел покрытия)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_search_stats_requires_auth(client: AsyncClient):
    resp = await client.get("/articles/search/stats", params={"search": "AI"})
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_search_stats_filters_by_keyword_and_includes_open_access(
    authenticated_client: AsyncClient,
    db_session: AsyncSession,
):
    me = await authenticated_client.get("/users/me")
    user_id = me.json()["id"]
    await _seed_search(
        db_session,
        user_id=user_id,
        query="q",
        articles_data=[
            {"title": "Neural networks", "open_access": True},
            {"title": "Unrelated", "open_access": False},
        ],
    )

    resp = await authenticated_client.get("/articles/search/stats", params={"search": "neural"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 1
    assert {row["label"]: row["count"] for row in body["by_open_access"]} == {"true": 1}


# ---------------------------------------------------------------------------
# Роутер: GET /articles/stats/personal (новый эндпоинт)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_personal_stats_requires_auth(client: AsyncClient):
    resp = await client.get("/articles/stats/personal")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_personal_stats_empty_history_returns_zeros(authenticated_client: AsyncClient):
    resp = await authenticated_client.get("/articles/stats/personal")
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 0
    assert body["by_open_access"] == []


@pytest.mark.asyncio
async def test_personal_stats_response_shape_and_open_access_labels(
    authenticated_client: AsyncClient,
    db_session: AsyncSession,
):
    me = await authenticated_client.get("/users/me")
    user_id = me.json()["id"]
    await _seed_search(
        db_session,
        user_id=user_id,
        query="AI",
        articles_data=[{"open_access": True}, {"open_access": False}],
    )

    resp = await authenticated_client.get("/articles/stats/personal")
    assert resp.status_code == 200
    body = resp.json()

    assert body["total"] == 2
    labels = {row["label"]: row["count"] for row in body["by_open_access"]}
    # "true"/"false" — та же конвенция, что PivotDimension="open_access" в Table Builder
    assert labels == {"true": 1, "false": 1}


@pytest.mark.asyncio
async def test_personal_stats_excludes_other_users_articles(
    authenticated_client: AsyncClient,
    db_session: AsyncSession,
):
    me = await authenticated_client.get("/users/me")
    user_id = me.json()["id"]

    other = await authenticated_client.post(
        "/users/register",
        json={
            "username": "otheruser2",
            "email": "other2@example.com",
            "password": "Str0ngPass!",
            "password_confirm": "Str0ngPass!",
        },
    )
    other_user_id = other.json()["id"]

    await _seed_search(db_session, user_id=user_id, query="mine", articles_data=[{}])
    await _seed_search(db_session, user_id=other_user_id, query="not-mine", articles_data=[{}, {}, {}])

    resp = await authenticated_client.get("/articles/stats/personal")
    assert resp.json()["total"] == 1
