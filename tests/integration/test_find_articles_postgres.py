"""PostgreSQL-only tests for Commit 3 /articles/find advisory-lock concurrency.

Проверяют:
  - pg_advisory_xact_lock сериализует параллельные проверки квоты одного user_id;
  - ровно один свободный слот при 199 предзаполненных строках → один 200 и остальные 429;
  - разные user_id не блокируют друг друга.

Skipped if DATABASE_TEST_URL не задан (см. tests/integration/conftest.py::pg_engine).
"""
import asyncio
import datetime
from datetime import date, timezone, timedelta

import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.dependencies import get_db_session
from app.main import app
from app.models.article import Article
from app.models.base import Base
from app.models.search_history import SearchHistory


@pytest.fixture
def _mock_scopus(monkeypatch):
    async def mock_search(self, keyword: str, count: int = 25):
        return [
            Article(
                title="P1",
                author="A",
                publication_date=date(2026, 1, 1),
                doi="10.pg/1",
                keyword=keyword,
                is_seeded=False,
            )
        ]
    monkeypatch.setattr(
        "app.infrastructure.scopus_client.ScopusHTTPClient.search", mock_search
    )


@pytest.mark.asyncio
@pytest.mark.requires_pg
async def test_single_slot_allows_exactly_one_success(
    pg_authenticated_client: AsyncClient,
    pg_session: AsyncSession,
    _mock_scopus,
):
    """При 199 свежих строках → ровно 1 ответ 200 и остальные 429 на N-параллельных запросах.

    После рефакторинга conftest pg_client выдаёт каждому HTTP-запросу
    собственную сессию, поэтому advisory-lock реально сериализует конкурентные
    проверки квоты. Ассерт точный: == 1 / == 4.
    """
    me = await pg_authenticated_client.get("/users/me")
    assert me.status_code == 200, f"/users/me failed: {me.text}"
    user_id = me.json()["id"]

    now = datetime.datetime.now(tz=timezone.utc)
    rows = [
        SearchHistory(
            user_id=user_id,
            query=f"seed{i}",
            result_count=1,
            filters={},
            created_at=now - timedelta(minutes=i),
        )
        for i in range(199)
    ]
    pg_session.add_all(rows)
    await pg_session.commit()

    tasks = [
        pg_authenticated_client.get("/articles/find", params={"keyword": "AI"})
        for _ in range(5)
    ]
    responses = await asyncio.gather(*tasks)

    codes = [r.status_code for r in responses]
    # Раздельные сессии + advisory-lock → детерминированный результат
    assert codes.count(200) == 1, f"Expected exactly one 200, got: {codes}"
    assert codes.count(429) == 4, f"Expected four 429, got: {codes}"


@pytest.mark.asyncio
@pytest.mark.requires_pg
async def test_parallel_requests_near_quota_boundary(_mock_scopus, tmp_path):
    """Жёсткая конкурентная проверка: несколько одновременных подключений,
    каждое со своей сессией, бьют в /articles/find одного пользователя
    при 199 предзаполненных строках. Advisory-lock обеспечивает: ровно 1 x 200,
    остальные x 429.

    Тест намеренно создаёт собственный движок и не использует pg_engine
    из conftest — это обеспечивает полную изоляцию от других тестов и
    максимально реалистичную конкуренцию на уровне PG-соединений.
    """
    import os

    pg_url = os.environ.get("DATABASE_TEST_URL")
    if not pg_url:
        pytest.skip("DATABASE_TEST_URL не задан")

    engine = create_async_engine(pg_url, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session_maker = async_sessionmaker(engine, expire_on_commit=False)

    async def override_get_db():
        async with session_maker() as s:
            yield s

    app.dependency_overrides[get_db_session] = override_get_db

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        reg = await ac.post("/users/register", json={
            "username": "concu", "email": "concu@example.com",
            "password": "Str0ngPass!", "password_confirm": "Str0ngPass!",
        })
        assert reg.status_code == 201, f"Register failed: {reg.text}"

        login = await ac.post("/users/login", json={
            "email": "concu@example.com", "password": "Str0ngPass!",
        })
        assert login.status_code == 200, f"Login failed: {login.text}"

        token = login.json()["access_token"]
        ac.headers["Authorization"] = f"Bearer {token}"

        me = await ac.get("/users/me")
        assert me.status_code == 200, f"/users/me failed: {me.text}"
        user_id = me.json()["id"]

        async with session_maker() as s:
            now = datetime.datetime.now(tz=timezone.utc)
            s.add_all([
                SearchHistory(
                    user_id=user_id,
                    query=f"q{i}",
                    result_count=1,
                    filters={},
                    created_at=now - timedelta(minutes=i),
                )
                for i in range(199)
            ])
            await s.commit()

        tasks = [
            ac.get("/articles/find", params={"keyword": "AI"})
            for _ in range(5)
        ]
        responses = await asyncio.gather(*tasks)
        codes = [r.status_code for r in responses]

        assert codes.count(200) == 1, f"Expected exactly one 200, got {codes}"
        assert codes.count(429) == 4, f"Expected four 429, got {codes}"

    app.dependency_overrides.clear()

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest.mark.asyncio
@pytest.mark.requires_pg
async def test_different_users_do_not_share_lock(_mock_scopus, tmp_path):
    """Разные user_id → разные advisory-lock ключи → не блокируют друг друга.

    Тест намеренно создаёт собственный движок: ему нужны два независимых
    AsyncClient с разными сессиями, никак не связанных с pg_authenticated_client
    из conftest. Использование pg_engine из conftest создало бы неявную связанность
    между тестами через teardown-порядок.
    """
    import os

    pg_url = os.environ.get("DATABASE_TEST_URL")
    if not pg_url:
        pytest.skip("DATABASE_TEST_URL не задан")

    engine = create_async_engine(pg_url, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session_maker = async_sessionmaker(engine, expire_on_commit=False)

    async def override_get_db():
        async with session_maker() as s:
            yield s

    app.dependency_overrides[get_db_session] = override_get_db

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac1, AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac2:

        for (name, email, client) in [
            ("usr1", "u1@ex.com", ac1),
            ("usr2", "u2@ex.com", ac2),
        ]:
            reg = await client.post("/users/register", json={
                "username": name, "email": email,
                "password": "Str0ngPass!", "password_confirm": "Str0ngPass!",
            })
            assert reg.status_code == 201, f"Register {email} failed: {reg.text}"

            login = await client.post("/users/login", json={
                "email": email, "password": "Str0ngPass!",
            })
            assert login.status_code == 200, f"Login {email} failed: {login.text}"
            client.headers["Authorization"] = f"Bearer {login.json()['access_token']}"

        r1, r2 = await asyncio.gather(
            ac1.get("/articles/find", params={"keyword": "AI"}),
            ac2.get("/articles/find", params={"keyword": "AI"}),
        )
        assert r1.status_code == 200, f"User 1 request failed: {r1.text}"
        assert r2.status_code == 200, f"User 2 request failed: {r2.text}"

    app.dependency_overrides.clear()

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()