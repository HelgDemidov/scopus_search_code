"""Тесты get_personal_activity_for_user + GET /articles/stats/personal/activity
(docs/explore-personal-redesign/spec.md §2.1) — поисковая активность пользователя
по времени: successful/zero_result поиски по периодам + накопление уникальных
статей (по первому появлению, не по сумме result_count).

SQLite (db_session/client/authenticated_client из tests/conftest.py) — репозиторий
не использует PG-специфичный SQL, requires_pg не нужен.
"""

import datetime
from datetime import date, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.postgres_search_result_repo import PostgresSearchResultRepository
from app.models.article import Article
from app.models.search_history import SearchHistory
from app.models.search_result_article import SearchResultArticle

_doi_counter = 0

# 2024-01-01 — понедельник; фиксированная база вместо datetime.now() убирает
# флаки вокруг реальных границ недели/месяца в момент прогона теста.
_MONDAY = datetime.datetime(2024, 1, 1, tzinfo=timezone.utc)


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
        )
        session.add(a)
        articles.append(a)
    await session.flush()

    for rank, a in enumerate(articles):
        session.add(SearchResultArticle(search_history_id=history.id, article_id=a.id, rank=rank))
    await session.commit()
    return history.id


# ---------------------------------------------------------------------------
# Пустая история
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_empty_history_returns_empty_buckets(db_session: AsyncSession):
    repo = PostgresSearchResultRepository(db_session)

    data = await repo.get_personal_activity_for_user(user_id=1)

    assert data == {"granularity": "week", "buckets": []}


# ---------------------------------------------------------------------------
# Авто-грануляция (spec.md §2.1: week <= 70 дней разброса, иначе month)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_granularity_week_for_short_span(db_session: AsyncSession):
    repo = PostgresSearchResultRepository(db_session)
    await _seed_search(db_session, user_id=1, query="a", articles_data=[{}], created_at=_MONDAY)
    await _seed_search(
        db_session, user_id=1, query="b", articles_data=[{}], created_at=_MONDAY + datetime.timedelta(days=4)
    )

    data = await repo.get_personal_activity_for_user(user_id=1)

    assert data["granularity"] == "week"


@pytest.mark.asyncio
async def test_granularity_month_for_long_span(db_session: AsyncSession):
    repo = PostgresSearchResultRepository(db_session)
    await _seed_search(db_session, user_id=1, query="a", articles_data=[{}], created_at=_MONDAY)
    await _seed_search(
        db_session, user_id=1, query="b", articles_data=[{}], created_at=_MONDAY + datetime.timedelta(days=105)
    )

    data = await repo.get_personal_activity_for_user(user_id=1)

    assert data["granularity"] == "month"


# ---------------------------------------------------------------------------
# successful vs zero_result поиски
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_successful_and_zero_result_searches_counted_separately(db_session: AsyncSession):
    repo = PostgresSearchResultRepository(db_session)
    await _seed_search(db_session, user_id=1, query="hit", articles_data=[{}, {}], created_at=_MONDAY)
    await _seed_search(
        db_session, user_id=1, query="miss", articles_data=[], created_at=_MONDAY + datetime.timedelta(days=1)
    )

    data = await repo.get_personal_activity_for_user(user_id=1)

    assert len(data["buckets"]) == 1  # оба поиска в одной неделе
    bucket = data["buckets"][0]
    assert bucket["successful_searches"] == 1
    assert bucket["zero_result_searches"] == 1


# ---------------------------------------------------------------------------
# Накопление уникальных статей — по первому появлению, не по сумме result_count
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_cumulative_unique_articles_not_double_counted_on_repeat_search(db_session: AsyncSession):
    repo = PostgresSearchResultRepository(db_session)
    shared_doi = "10.test/shared-activity"
    await _seed_search(db_session, user_id=1, query="AI", articles_data=[{"doi": shared_doi}], created_at=_MONDAY)

    # Второй поиск (другая неделя) ссылается на ТУ ЖЕ статью
    week2 = _MONDAY + datetime.timedelta(days=10)
    history2 = SearchHistory(user_id=1, query="machine learning", result_count=1, filters={}, created_at=week2)
    db_session.add(history2)
    await db_session.flush()
    existing = (await db_session.execute(select(Article).where(Article.doi == shared_doi))).scalar_one()
    db_session.add(SearchResultArticle(search_history_id=history2.id, article_id=existing.id, rank=0))
    await db_session.commit()

    data = await repo.get_personal_activity_for_user(user_id=1)

    assert len(data["buckets"]) == 2
    assert data["buckets"][0]["cumulative_unique_articles"] == 1
    # Вторая неделя: поиск был (successful_searches=1), но накопление НЕ выросло —
    # статья уже учтена по первому появлению в первой неделе
    assert data["buckets"][1]["successful_searches"] == 1
    assert data["buckets"][1]["cumulative_unique_articles"] == 1


@pytest.mark.asyncio
async def test_new_articles_increase_cumulative_each_period(db_session: AsyncSession):
    repo = PostgresSearchResultRepository(db_session)
    await _seed_search(db_session, user_id=1, query="a", articles_data=[{}, {}], created_at=_MONDAY)
    await _seed_search(
        db_session, user_id=1, query="b", articles_data=[{}], created_at=_MONDAY + datetime.timedelta(days=10)
    )

    data = await repo.get_personal_activity_for_user(user_id=1)

    assert [b["cumulative_unique_articles"] for b in data["buckets"]] == [2, 3]


# ---------------------------------------------------------------------------
# Изоляция между пользователями (security-critical)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_other_users_activity_excluded(db_session: AsyncSession):
    repo = PostgresSearchResultRepository(db_session)
    await _seed_search(db_session, user_id=1, query="mine", articles_data=[{}], created_at=_MONDAY)
    await _seed_search(db_session, user_id=2, query="not-mine", articles_data=[{}, {}], created_at=_MONDAY)

    data = await repo.get_personal_activity_for_user(user_id=1)

    assert len(data["buckets"]) == 1
    assert data["buckets"][0]["successful_searches"] == 1
    assert data["buckets"][0]["cumulative_unique_articles"] == 1


# ---------------------------------------------------------------------------
# Роутер: GET /articles/stats/personal/activity
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_personal_activity_requires_auth(client: AsyncClient):
    resp = await client.get("/articles/stats/personal/activity")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_personal_activity_empty_history_returns_empty_buckets(authenticated_client: AsyncClient):
    resp = await authenticated_client.get("/articles/stats/personal/activity")
    assert resp.status_code == 200
    body = resp.json()
    assert body == {"granularity": "week", "buckets": []}


@pytest.mark.asyncio
async def test_personal_activity_response_shape(
    authenticated_client: AsyncClient,
    db_session: AsyncSession,
):
    me = await authenticated_client.get("/users/me")
    user_id = me.json()["id"]
    await _seed_search(db_session, user_id=user_id, query="AI", articles_data=[{}, {}], created_at=_MONDAY)

    resp = await authenticated_client.get("/articles/stats/personal/activity")
    assert resp.status_code == 200
    body = resp.json()

    assert body["granularity"] == "week"
    assert len(body["buckets"]) == 1
    bucket = body["buckets"][0]
    assert set(bucket) == {
        "period_start",
        "successful_searches",
        "zero_result_searches",
        "cumulative_unique_articles",
    }
    assert bucket["successful_searches"] == 1
    assert bucket["cumulative_unique_articles"] == 2
