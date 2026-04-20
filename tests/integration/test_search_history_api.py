"""Integration tests for Commit 2: /articles/history and /articles/find/quota.

Test matrix (см. тех-спек v4, §4.1, Commit 2):
  - GET /articles/history — требует auth (401 без токена)
  - GET /articles/history — возвращает только строки текущего пользователя
  - GET /articles/history — не больше 100 записей
  - GET /articles/history — порядок created_at DESC
  - GET /articles/history — схема ответа содержит id, query, created_at, result_count, filters
  - GET /articles/find/quota — требует auth (401 без токена)
  - GET /articles/find/quota — возвращает limit, used, remaining, reset_at, window_days
  - GET /articles/find/quota — used считает только строки внутри 7-дневного окна
  - Роутная безопасность: /history и /find/quota резолвятся до /{article_id}

Почему НЕ используем scope="module":
  pytest.ini задает asyncio_default_fixture_loop_scope = function — event loop
  живет ровно одну тест-функцию. Async-фикстуры scope="module" требуют loop,
  переживающий весь модуль → ScopeMismatch на каждом тесте при setup.
  Решение: используем conftest.py-фикстуры (scope="function") без изменений.

Почему pg_* фикстуры:
  JSONB-поле filters (SearchHistory.filters) поддерживается только PostgreSQL.
  SQLite не умеет JSONB → тесты с реальными INSERT/SELECT по этой модели
  требуют настоящего PostgreSQL. Фикстуры pg_* поднимаются только если
  DATABASE_TEST_URL задан (CI: GitHub Actions postgres service; локально: docker).
"""

import datetime
from datetime import timezone, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.search_history import SearchHistory
from app.models.user import User


# ---------------------------------------------------------------------------
# Вспомогательная функция: вставляет n строк истории для указанного user_id
# ---------------------------------------------------------------------------

async def _insert_history_rows(
    session: AsyncSession,
    user_id: int,
    n: int,
    base_time: datetime.datetime | None = None,
) -> list[SearchHistory]:
    """Вставляет n строк SearchHistory для user_id через ORM-сессию conftest."""
    now = base_time or datetime.datetime.now(tz=timezone.utc)
    rows = [
        SearchHistory(
            user_id=user_id,
            query=f"test query {i}",
            created_at=now - timedelta(minutes=i),
            result_count=i + 1,
            filters={"year_from": 2020} if i % 2 == 0 else {},
        )
        for i in range(n)
    ]
    session.add_all(rows)
    await session.commit()
    for r in rows:
        await session.refresh(r)
    return rows


# ---------------------------------------------------------------------------
# Тесты: GET /articles/history
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
@pytest.mark.requires_pg
async def test_history_requires_auth(pg_client: AsyncClient):
    """GET /articles/history без токена → 401."""
    resp = await pg_client.get("/articles/history")
    assert resp.status_code == 401


@pytest.mark.asyncio
@pytest.mark.requires_pg
async def test_history_returns_only_current_user_rows(
    pg_client: AsyncClient,
    pg_session: AsyncSession,
    pg_logged_in: dict,
):
    """GET /articles/history возвращает только строки текущего пользователя."""
    token = pg_logged_in["access_token"]
    auth_headers = {"Authorization": f"Bearer {token}"}

    # Получаем user_id основного пользователя через /users/me
    me_resp = await pg_client.get("/users/me", headers=auth_headers)
    assert me_resp.status_code == 200
    user_id = me_resp.json()["id"]

    # Регистрируем второго пользователя через HTTP
    reg_resp = await pg_client.post("/users/register", json={
        "username": "other_hist",
        "email": "other_hist@example.com",
        "password": "Str0ngPass!",
        "password_confirm": "Str0ngPass!",
    })
    assert reg_resp.status_code == 201

    # Получаем user_id второго пользователя через SELECT в той же сессии
    res = await pg_session.execute(
        select(User).where(User.username == "other_hist")
    )
    other_user = res.scalar_one()

    # Вставляем по 2 строки истории на каждого пользователя
    await _insert_history_rows(pg_session, user_id, 2)
    await _insert_history_rows(pg_session, other_user.id, 2)

    resp = await pg_client.get("/articles/history", headers=auth_headers)
    assert resp.status_code == 200
    body = resp.json()

    # Собираем id строк other_user из БД
    other_rows = await pg_session.execute(
        select(SearchHistory.id).where(SearchHistory.user_id == other_user.id)
    )
    other_ids = {row[0] for row in other_rows.fetchall()}

    # В ответе не должно быть ни одного id из чужой истории
    resp_ids = {item["id"] for item in body["items"]}
    assert resp_ids.isdisjoint(other_ids), "В ответе присутствуют записи другого пользователя"


@pytest.mark.asyncio
@pytest.mark.requires_pg
async def test_history_limited_to_100_rows(
    pg_client: AsyncClient,
    pg_session: AsyncSession,
    pg_logged_in: dict,
):
    """GET /articles/history возвращает не более 100 строк, даже если в БД больше."""
    token = pg_logged_in["access_token"]
    auth_headers = {"Authorization": f"Bearer {token}"}

    me_resp = await pg_client.get("/users/me", headers=auth_headers)
    user_id = me_resp.json()["id"]

    await _insert_history_rows(pg_session, user_id, 110)

    resp = await pg_client.get("/articles/history", headers=auth_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] <= 100
    assert len(body["items"]) <= 100


@pytest.mark.asyncio
@pytest.mark.requires_pg
async def test_history_ordered_desc(
    pg_client: AsyncClient,
    pg_session: AsyncSession,
    pg_logged_in: dict,
):
    """GET /articles/history возвращает строки в порядке created_at DESC."""
    token = pg_logged_in["access_token"]
    auth_headers = {"Authorization": f"Bearer {token}"}

    me_resp = await pg_client.get("/users/me", headers=auth_headers)
    user_id = me_resp.json()["id"]

    await _insert_history_rows(pg_session, user_id, 5)

    resp = await pg_client.get("/articles/history", headers=auth_headers)
    assert resp.status_code == 200
    items = resp.json()["items"]
    created_ats = [item["created_at"] for item in items]

    # Каждый следующий элемент должен быть <= предыдущему (DESC)
    for i in range(len(created_ats) - 1):
        assert created_ats[i] >= created_ats[i + 1], (
            f"Нарушен порядок DESC: {created_ats[i]} < {created_ats[i + 1]}"
        )


@pytest.mark.asyncio
@pytest.mark.requires_pg
async def test_history_response_schema(
    pg_client: AsyncClient,
    pg_session: AsyncSession,
    pg_logged_in: dict,
):
    """Схема ответа содержит id, query, created_at, result_count, filters."""
    token = pg_logged_in["access_token"]
    auth_headers = {"Authorization": f"Bearer {token}"}

    me_resp = await pg_client.get("/users/me", headers=auth_headers)
    user_id = me_resp.json()["id"]

    await _insert_history_rows(pg_session, user_id, 1)

    resp = await pg_client.get("/articles/history", headers=auth_headers)
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert len(items) >= 1
    item = items[0]
    for field in ("id", "query", "created_at", "result_count", "filters"):
        assert field in item, f"Поле '{field}' отсутствует в схеме ответа"


# ---------------------------------------------------------------------------
# Тесты: GET /articles/find/quota
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
@pytest.mark.requires_pg
async def test_quota_requires_auth(pg_client: AsyncClient):
    """GET /articles/find/quota без токена → 401."""
    resp = await pg_client.get("/articles/find/quota")
    assert resp.status_code == 401


@pytest.mark.asyncio
@pytest.mark.requires_pg
async def test_quota_response_fields(
    pg_client: AsyncClient,
    pg_session: AsyncSession,
    pg_logged_in: dict,
):
    """GET /articles/find/quota возвращает limit, used, remaining, reset_at, window_days."""
    token = pg_logged_in["access_token"]
    auth_headers = {"Authorization": f"Bearer {token}"}

    me_resp = await pg_client.get("/users/me", headers=auth_headers)
    user_id = me_resp.json()["id"]

    await _insert_history_rows(pg_session, user_id, 3)

    resp = await pg_client.get("/articles/find/quota", headers=auth_headers)
    assert resp.status_code == 200
    body = resp.json()

    for field in ("limit", "used", "remaining", "reset_at", "window_days"):
        assert field in body, f"Поле '{field}' отсутствует в ответе /find/quota"

    # Математическая корректность: remaining = limit - used, не меньше 0
    assert body["remaining"] == max(0, body["limit"] - body["used"])
    assert body["limit"] == 200
    assert body["window_days"] == 7


@pytest.mark.asyncio
@pytest.mark.requires_pg
async def test_quota_used_counts_only_window(
    pg_client: AsyncClient,
    pg_session: AsyncSession,
    pg_logged_in: dict,
):
    """used включает только строки из скользящего 7-дневного окна; более старые не считаются."""
    token = pg_logged_in["access_token"]
    auth_headers = {"Authorization": f"Bearer {token}"}

    me_resp = await pg_client.get("/users/me", headers=auth_headers)
    user_id = me_resp.json()["id"]

    # 5 строк с датой за пределами окна (8 дней назад)
    old_time = datetime.datetime.now(tz=timezone.utc) - timedelta(days=8)
    await _insert_history_rows(pg_session, user_id, 5, base_time=old_time)

    resp_before = await pg_client.get("/articles/find/quota", headers=auth_headers)
    used_before = resp_before.json()["used"]

    # 2 свежих строки внутри окна
    fresh_time = datetime.datetime.now(tz=timezone.utc)
    await _insert_history_rows(pg_session, user_id, 2, base_time=fresh_time)

    resp_after = await pg_client.get("/articles/find/quota", headers=auth_headers)
    used_after = resp_after.json()["used"]

    # Счетчик должен вырасти ровно на 2, а не на 7
    assert used_after == used_before + 2, (
        f"Ожидали used={used_before + 2}, получили {used_after}: "
        "строки за пределами окна не должны учитываться"
    )


# ---------------------------------------------------------------------------
# Тест: роутная безопасность
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
@pytest.mark.requires_pg
async def test_history_route_does_not_match_article_id(
    pg_client: AsyncClient,
    pg_logged_in: dict,
):
    """'history' и 'find' не матчатся как int-сегмент /{article_id} → не 422."""
    auth_headers = {"Authorization": f"Bearer {pg_logged_in['access_token']}"}

    # Если /history заматчился бы как /{article_id}, было бы 422 (int validation error)
    resp = await pg_client.get("/articles/history", headers=auth_headers)
    assert resp.status_code != 422, (
        "'history' матчится как int article_id — нарушен порядок роутов"
    )

    resp2 = await pg_client.get("/articles/find/quota", headers=auth_headers)
    assert resp2.status_code != 422, (
        "'find' матчится как int article_id — нарушен порядок роутов"
    )