"""Integration tests for retention/trim (docs/personal-search-data/spec.md §1).

SearchService.find_and_save тримит search_history до
SearchHistoryService.HISTORY_DEPTH_LIMIT (100) строк на пользователя сразу
после каждого поиска — бесшовно, без блока/ошибки для клиента.

Не требуют requires_pg: trim_to_last_n не использует PG-специфичный синтаксис
(тот же прецедент, что test_find_articles.py — get_advisory_lock_factory уже
переопределён на no-op в tests/conftest.py для SQLite-клиента).

Отдельная группа тестов проверяет keep_since-предохранитель: HISTORY_DEPTH_LIMIT
(100) < QUOTA_LIMIT (200) за то же 7-дневное окно, поэтому чистый count-based
trim мог бы задним числом занижать count_in_window() и делать 429 недостижимым
для активных пользователей — найдено при проектировании этих самых тестов,
не было в исходной спеке §1.
"""

import datetime
from datetime import timedelta, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.article import Article
from app.models.search_history import SearchHistory
from app.services.search_history_service import SearchHistoryService

_LIMIT = SearchHistoryService.HISTORY_DEPTH_LIMIT


@pytest.fixture
def mock_scopus_one_article(monkeypatch):
    async def mock_search(self, keyword: str, count: int = 25, filters: dict | None = None):
        return [
            Article(
                title=f"Paper for {keyword}",
                author="A",
                publication_date=datetime.date(2026, 1, 1),
                doi=f"10.t/{keyword}",
            )
        ]

    monkeypatch.setattr("app.infrastructure.scopus_client.ScopusHTTPClient.search", mock_search)


async def _seed_history_rows(
    db_session: AsyncSession,
    user_id: int,
    n: int,
    *,
    query_prefix: str,
    age_start: timedelta,
    age_step: timedelta,
) -> None:
    """Предзаполняет n строк истории с убывающей свежестью: строка i имеет
    created_at = now - (age_start + i * age_step). i=0 — самая свежая из пачки."""
    now = datetime.datetime.now(tz=timezone.utc)
    rows = [
        SearchHistory(
            user_id=user_id,
            query=f"{query_prefix}-{i}",
            result_count=1,
            filters={},
            created_at=now - (age_start + i * age_step),
        )
        for i in range(n)
    ]
    db_session.add_all(rows)
    await db_session.commit()


async def _user_history_queries(db_session: AsyncSession, user_id: int) -> set[str]:
    rows = (
        (await db_session.execute(select(SearchHistory).where(SearchHistory.user_id == user_id))).scalars().all()
    )
    return {r.query for r in rows}


# ---------------------------------------------------------------------------
# Базовое поведение: депth не превышается, старейшая запись тихо уходит
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_find_seamlessly_trims_oldest_when_at_limit(
    authenticated_client: AsyncClient,
    db_session: AsyncSession,
    mock_scopus_one_article,
):
    me = await authenticated_client.get("/users/me")
    user_id = me.json()["id"]

    # Ровно LIMIT строк, все ВНЕ квотного окна (10+ дней — типичный «давний пользователь»,
    # не пользователь, сделавший 100 поисков за последний час). old-0 самая свежая
    # из пачки, old-(LIMIT-1) самая старая.
    await _seed_history_rows(
        db_session,
        user_id,
        _LIMIT,
        query_prefix="old",
        age_start=timedelta(days=10),
        age_step=timedelta(minutes=1),
    )

    resp = await authenticated_client.get("/articles/find", params={"keyword": "newsearch"})
    assert resp.status_code == 200, resp.text

    queries = await _user_history_queries(db_session, user_id)
    assert len(queries) == _LIMIT  # глубина не превышена — 101-я (самая старая) ушла
    assert f"old-{_LIMIT - 1}" not in queries  # самая старая из предзаполненных удалена
    assert "old-0" in queries  # вторая по свежести пережила trim (граничная проверка)
    assert "newsearch" in queries  # новый поиск сохранился, клиент не увидел ошибки


# ---------------------------------------------------------------------------
# Регрессия: keep_since не даёт retention занизить count_in_window() квоты
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_find_does_not_trim_rows_within_quota_window_beyond_depth_limit(
    authenticated_client: AsyncClient,
    db_session: AsyncSession,
    mock_scopus_one_article,
):
    """150 строк за последние часы (< 7 дней, < QUOTA_LIMIT=200) — все выше
    HISTORY_DEPTH_LIMIT=100, но retention не должен тронуть ни одну: все внутри
    квотного окна. Без keep_since это тест бы упал (осталось бы 100, не 151)."""
    me = await authenticated_client.get("/users/me")
    user_id = me.json()["id"]

    await _seed_history_rows(
        db_session,
        user_id,
        150,
        query_prefix="recent",
        age_start=timedelta(minutes=1),
        age_step=timedelta(minutes=1),
    )

    resp = await authenticated_client.get("/articles/find", params={"keyword": "newsearch"})
    assert resp.status_code == 200, resp.text

    queries = await _user_history_queries(db_session, user_id)
    assert len(queries) == 151  # ничего не удалено, несмотря на превышение depth limit
    assert "newsearch" in queries


# ---------------------------------------------------------------------------
# Старые строки вне квотного окна по-прежнему подчищаются, даже при защите свежих
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_find_trims_old_rows_outside_quota_window_even_when_recent_exceed_limit(
    authenticated_client: AsyncClient,
    db_session: AsyncSession,
    mock_scopus_one_article,
):
    """100 свежих строк (защищены keep_since) + 5 старых (10 дней — вне окна).
    Старые должны быть удалены; свежие — нет, даже когда общий счёт был 105 > 100."""
    me = await authenticated_client.get("/users/me")
    user_id = me.json()["id"]

    await _seed_history_rows(
        db_session,
        user_id,
        _LIMIT,
        query_prefix="recent",
        age_start=timedelta(minutes=1),
        age_step=timedelta(minutes=1),
    )
    await _seed_history_rows(
        db_session,
        user_id,
        5,
        query_prefix="stale",
        age_start=timedelta(days=10),
        age_step=timedelta(minutes=1),
    )

    resp = await authenticated_client.get("/articles/find", params={"keyword": "newsearch"})
    assert resp.status_code == 200, resp.text

    queries = await _user_history_queries(db_session, user_id)
    assert len(queries) == _LIMIT + 1  # 100 recent + newsearch; 5 stale удалены
    assert not any(q.startswith("stale-") for q in queries)
    assert all(q.startswith("recent-") for q in queries if q != "newsearch")
    assert "newsearch" in queries


# ---------------------------------------------------------------------------
# Другие пользователи не затрагиваются триммингом
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_find_trim_does_not_affect_other_users(
    authenticated_client: AsyncClient,
    db_session: AsyncSession,
    mock_scopus_one_article,
):
    # Второй реальный пользователь (не через фейковый user_id — search_history.user_id
    # это настоящий FK на users.id)
    other = await authenticated_client.post(
        "/users/register",
        json={
            "username": "otheruser",
            "email": "other@example.com",
            "password": "Str0ngPass!",
            "password_confirm": "Str0ngPass!",
        },
    )
    assert other.status_code == 201, other.text
    other_user_id = other.json()["id"]

    await _seed_history_rows(
        db_session,
        other_user_id,
        _LIMIT,
        query_prefix="other-user",
        age_start=timedelta(minutes=1),
        age_step=timedelta(minutes=1),
    )

    me = await authenticated_client.get("/users/me")
    user_id = me.json()["id"]
    await _seed_history_rows(
        db_session,
        user_id,
        _LIMIT,
        query_prefix="mine",
        age_start=timedelta(minutes=1),
        age_step=timedelta(minutes=1),
    )

    resp = await authenticated_client.get("/articles/find", params={"keyword": "newsearch"})
    assert resp.status_code == 200, resp.text

    other_queries = await _user_history_queries(db_session, other_user_id)
    assert len(other_queries) == _LIMIT  # чужая история не тронута
