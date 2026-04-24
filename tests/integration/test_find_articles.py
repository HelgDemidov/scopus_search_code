"""Integration tests for Commit 3: /articles/find with auth, quota, history, filters.

Выполняются на SQLite in-memory через shared conftest (client + authenticated_client).
PG-only детали (advisory-lock concurrency, JSONB-специфика) вынесены в
test_find_articles_postgres.py и маркируются requires_pg.
"""
import datetime
from datetime import date, timezone, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.article import Article
from app.models.search_history import SearchHistory
from app.main import app
from app.interfaces.search_client import ISearchClient
from app.services.search_service import SearchService


# ---------------------------------------------------------------------------
# Mock Scopus: возвращает 2 статьи. Подменяем сам метод клиента —
# роутер всё равно вызывает service.find_and_save, который ходит в клиент.
# ---------------------------------------------------------------------------

@pytest.fixture
def mock_scopus_two_articles(monkeypatch):
    async def mock_search(self, keyword: str, count: int = 25):
        return [
            Article(
                title="Paper 1",
                author="A",
                publication_date=date(2026, 1, 1),
                doi="10.t/1",
            ),
            Article(
                title="Paper 2",
                author="B",
                publication_date=date(2026, 1, 2),
                doi="10.t/2",
            ),
        ]
    monkeypatch.setattr(
        "app.infrastructure.scopus_client.ScopusHTTPClient.search", mock_search
    )


# ---------------------------------------------------------------------------
# Happy path: аутентифицированный запрос сохраняет статьи и пишет одну строку истории
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_find_happy_path_writes_one_history_row(
    authenticated_client: AsyncClient,
    db_session: AsyncSession,
    mock_scopus_two_articles,
):
    resp = await authenticated_client.get("/articles/find", params={"keyword": "AI"})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert len(body) == 2

    # Ровно одна строка истории — result_count соответствует количеству сохранённых
    rows = (await db_session.execute(select(SearchHistory))).scalars().all()
    assert len(rows) == 1
    assert rows[0].query == "AI"
    assert rows[0].result_count == 2


# ---------------------------------------------------------------------------
# Auth guard: без токена → 401 (существующий guard get_current_user)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_find_requires_auth(client: AsyncClient, mock_scopus_two_articles):
    resp = await client.get("/articles/find", params={"keyword": "AI"})
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Quota enforcement: 200 rows pre-seeded → 429, не зовёт Scopus, не пишет строку
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_find_returns_429_when_quota_exhausted(
    authenticated_client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch,
):
    # Определяем user_id через /users/me
    me = await authenticated_client.get("/users/me")
    user_id = me.json()["id"]

    # Предзаполняем 200 свежих строк истории
    now = datetime.datetime.now(tz=timezone.utc)
    rows = [
        SearchHistory(
            user_id=user_id,
            query=f"q{i}",
            result_count=1,
            filters={},
            created_at=now - timedelta(minutes=i),
        )
        for i in range(200)
    ]
    db_session.add_all(rows)
    await db_session.commit()

    # Спай: search не должен быть вызван
    calls = {"n": 0}

    async def spy_search(self, keyword: str, count: int = 25):
        calls["n"] += 1
        return []

    monkeypatch.setattr(
        "app.infrastructure.scopus_client.ScopusHTTPClient.search", spy_search
    )

    resp = await authenticated_client.get("/articles/find", params={"keyword": "AI"})
    assert resp.status_code == 429
    assert calls["n"] == 0

    # Количество строк истории не изменилось
    count_after = len(
        (await db_session.execute(select(SearchHistory))).scalars().all()
    )
    assert count_after == 200


# ---------------------------------------------------------------------------
# Filter persistence: переданные фильтры попадают в строку истории
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_find_persists_filters(
    authenticated_client: AsyncClient,
    db_session: AsyncSession,
    mock_scopus_two_articles,
):
    resp = await authenticated_client.get(
        "/articles/find",
        params=[
            ("keyword", "AI"),
            ("year_from", 2020),
            ("year_to", 2025),
            ("doc_types", "ar"),
            ("doc_types", "cp"),
            ("open_access", "true"),
            ("country", "USA"),
            ("country", "DEU"),
        ],
    )
    assert resp.status_code == 200, resp.text

    rows = (await db_session.execute(select(SearchHistory))).scalars().all()
    assert len(rows) == 1
    f = rows[0].filters
    assert f["year_from"] == 2020
    assert f["year_to"] == 2025
    assert f["doc_types"] == ["ar", "cp"]
    assert f["open_access"] is True
    assert f["country"] == ["USA", "DEU"]


# ---------------------------------------------------------------------------
# result_count соответствует числу сохранённых статей
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_find_result_count_equals_saved(
    authenticated_client: AsyncClient,
    db_session: AsyncSession,
    mock_scopus_two_articles,
):
    resp = await authenticated_client.get("/articles/find", params={"keyword": "AI"})
    assert resp.status_code == 200
    saved = len(resp.json())

    rows = (await db_session.execute(select(SearchHistory))).scalars().all()
    assert rows[0].result_count == saved


# ---------------------------------------------------------------------------
# Ошибка Scopus → строка истории не создаётся
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_find_scopus_error_writes_no_history(
    authenticated_client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch,
):
    async def raising_search(self, keyword: str, count: int = 25):
        raise RuntimeError("scopus down")

    monkeypatch.setattr(
        "app.infrastructure.scopus_client.ScopusHTTPClient.search", raising_search
    )

    try:
        resp = await authenticated_client.get("/articles/find", params={"keyword": "AI"})
        # FastAPI обернёт в 500
        assert resp.status_code in (500, 502, 503)
    except RuntimeError:
        # ASGI может пробросить исключение наружу — это тоже допустимо для теста
        pass

    rows = (await db_session.execute(select(SearchHistory))).scalars().all()
    assert rows == []
