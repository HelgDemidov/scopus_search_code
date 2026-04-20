"""Integration tests for Commit 2: /articles/history and /articles/find/quota.

Test matrix (см. тех-спек v4, §4.1, Commit 2):
  - GET /articles/history — требует auth (401 без токена)
  - GET /articles/history — возвращает только строки текущего пользователя
  - GET /articles/history — не больше 100 записей
  - GET /articles/history — порядок created_at DESC
  - GET /articles/history — схема ответа содержит id, query, created_at, result_count, filters
  - GET /articles/find/quota — требует auth (401 без токена)
  - GET /articles/find/quota — возвращает limit, used, remaining, reset_at
  - Роутная безопасность: /history и /find/quota резолвятся до /{article_id}
"""

import datetime
from datetime import timezone, timedelta

import pytest
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.core.dependencies import get_db_session
from app.models.search_history import SearchHistory
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.pool import StaticPool
from app.models.base import Base
from app.models.user import User
from app.core.security import hash_password, create_access_token

DATABASE_URL = "sqlite+aiosqlite:///:memory:"


# ---------------------------------------------------------------------------
# Фикстуры: in-memory SQLite DB + переопределение зависимости get_db_session
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def anyio_backend():
    return "asyncio"


@pytest.fixture(scope="module")
async def db_engine():
    # Создаем временную in-memory БД и полную схему через create_all
    engine = create_async_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    await engine.dispose()


@pytest.fixture(scope="module")
async def db_session(db_engine):
    # Фикстура дает одиначную сессию для всех тестов модуля
    Session = async_sessionmaker(db_engine, expire_on_commit=False)
    async with Session() as session:
        yield session


@pytest.fixture(scope="module")
async def client(db_session: AsyncSession):
    # Подменяем get_db_session на нашу in-memory сессию
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db_session] = override_get_db
    transport = ASGITransport(app=app)  # type: ignore[arg-type]
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


@pytest.fixture(scope="module")
async def test_user(db_session: AsyncSession) -> User:
    # Создаем тестового пользователя и сразу флашируем в БД
    user = User(
        username="testuser_hist",
        email="hist@example.com",
        hashed_password=hash_password("testpass"),
        is_active=True,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest.fixture(scope="module")
async def other_user(db_session: AsyncSession) -> User:
    # Второй пользователь — проверяем, что его история не утекает в чужой ответ
    user = User(
        username="other_user_hist",
        email="other_hist@example.com",
        hashed_password=hash_password("otherpass"),
        is_active=True,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest.fixture(scope="module")
def auth_headers(test_user: User) -> dict:
    # Генерируем JWT для test_user; user.id получаем через ORM-объект
    token = create_access_token(subject=test_user.username)
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def other_auth_headers(other_user: User) -> dict:
    token = create_access_token(subject=other_user.username)
    return {"Authorization": f"Bearer {token}"}


async def _insert_history_rows(
    session: AsyncSession,
    user_id: int,
    n: int,
    base_time: datetime.datetime | None = None,
) -> list[SearchHistory]:
    """Вспомогательная функция: вставляет n строк истории для user_id."""
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

@pytest.mark.anyio
async def test_history_requires_auth(client: AsyncClient):
    """GET /articles/history без токена → 401."""
    resp = await client.get("/articles/history")
    assert resp.status_code == 401


@pytest.mark.anyio
async def test_history_returns_only_current_user_rows(
    client: AsyncClient,
    db_session: AsyncSession,
    test_user: User,
    other_user: User,
    auth_headers: dict,
):
    """GET /articles/history возвращает только строки текущего пользователя."""
    # Создаем по 2 записи на каждого пользователя
    await _insert_history_rows(db_session, test_user.id, 2)
    await _insert_history_rows(db_session, other_user.id, 2)

    resp = await client.get("/articles/history", headers=auth_headers)
    assert resp.status_code == 200
    body = resp.json()
    # Проверяем, что нет ни одной записи other_user
    user_ids_in_resp = {item["id"] for item in body["items"]}
    other_user_rows = await db_session.execute(
        __import__("sqlalchemy").select(SearchHistory.id).where(
            SearchHistory.user_id == other_user.id
        )
    )
    other_ids = {row[0] for row in other_user_rows.fetchall()}
    assert user_ids_in_resp.isdisjoint(other_ids), "В ответе присутствуют записи другого пользователя"


@pytest.mark.anyio
async def test_history_limited_to_100_rows(
    client: AsyncClient,
    db_session: AsyncSession,
    test_user: User,
    auth_headers: dict,
):
    """GET /articles/history возвращает не более 100 строк, даже если в БД больше."""
    await _insert_history_rows(db_session, test_user.id, 110)
    resp = await client.get("/articles/history", headers=auth_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] <= 100
    assert len(body["items"]) <= 100


@pytest.mark.anyio
async def test_history_ordered_desc(
    client: AsyncClient,
    db_session: AsyncSession,
    test_user: User,
    auth_headers: dict,
):
    """GET /articles/history возвращает строки в порядке created_at DESC."""
    await _insert_history_rows(db_session, test_user.id, 5)
    resp = await client.get("/articles/history", headers=auth_headers)
    assert resp.status_code == 200
    items = resp.json()["items"]
    created_ats = [item["created_at"] for item in items]
    # Проверяем: каждый следующий <= предыдущему
    for i in range(len(created_ats) - 1):
        assert created_ats[i] >= created_ats[i + 1], (
            f"Нарушен порядок DESC: {created_ats[i]} < {created_ats[i+1]}"
        )


@pytest.mark.anyio
async def test_history_response_schema(
    client: AsyncClient,
    db_session: AsyncSession,
    test_user: User,
    auth_headers: dict,
):
    """Схема ответа содержит id, query, created_at, result_count, filters."""
    await _insert_history_rows(db_session, test_user.id, 1)
    resp = await client.get("/articles/history", headers=auth_headers)
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert len(items) >= 1
    item = items[0]
    for field in ("id", "query", "created_at", "result_count", "filters"):
        assert field in item, f"Поле '{field}' отсутствует в схеме ответа"


# ---------------------------------------------------------------------------
# Тесты: GET /articles/find/quota
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_quota_requires_auth(client: AsyncClient):
    """GET /articles/find/quota без токена → 401."""
    resp = await client.get("/articles/find/quota")
    assert resp.status_code == 401


@pytest.mark.anyio
async def test_quota_response_fields(
    client: AsyncClient,
    db_session: AsyncSession,
    test_user: User,
    auth_headers: dict,
):
    """GET /articles/find/quota возвращает limit, used, remaining, reset_at и window_days."""
    await _insert_history_rows(db_session, test_user.id, 3)
    resp = await client.get("/articles/find/quota", headers=auth_headers)
    assert resp.status_code == 200
    body = resp.json()
    for field in ("limit", "used", "remaining", "reset_at", "window_days"):
        assert field in body, f"Поле '{field}' отсутствует в ответе /find/quota"
    # Проверяем математическую корректность: remaining = limit - used, не меньше 0
    assert body["remaining"] == max(0, body["limit"] - body["used"])
    assert body["limit"] == 200
    assert body["window_days"] == 7


@pytest.mark.anyio
async def test_quota_used_counts_only_window(
    client: AsyncClient,
    db_session: AsyncSession,
    test_user: User,
    auth_headers: dict,
):
    """used включает только строки из скользящего 7-дневного окна; более старые не считаются."""
    old_time = datetime.datetime.now(tz=timezone.utc) - timedelta(days=8)
    # Вставляем 5 строк с датой за пределами окна
    await _insert_history_rows(db_session, test_user.id, 5, base_time=old_time)

    resp_before = await client.get("/articles/find/quota", headers=auth_headers)
    used_before = resp_before.json()["used"]

    # Вставляем 2 свежих строки внутри окна
    fresh_time = datetime.datetime.now(tz=timezone.utc)
    await _insert_history_rows(db_session, test_user.id, 2, base_time=fresh_time)

    resp_after = await client.get("/articles/find/quota", headers=auth_headers)
    used_after = resp_after.json()["used"]

    # Счетчик должен увеличиться ровно на 2, не на 7
    assert used_after == used_before + 2, (
        f"Ожидали used={used_before + 2}, получили {used_after}: "
        "строки за пределами окна не должны учитываться"
    )


# ---------------------------------------------------------------------------
# Тест: роутная безопасность
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_history_route_does_not_match_article_id(client: AsyncClient, auth_headers: dict):
    """'history' и 'find' не матчатся как int-сегмент /{article_id}."""
    # Если /history заматчился бы как /{article_id}, было бы 422 (int validation error)
    resp = await client.get("/articles/history", headers=auth_headers)
    assert resp.status_code != 422, "'history' матчится как int article_id — нарушен порядок роутов"

    resp2 = await client.get("/articles/find/quota", headers=auth_headers)
    assert resp2.status_code != 422, "'find' матчится как int article_id — нарушен порядок роутов"
