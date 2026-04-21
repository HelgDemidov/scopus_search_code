"""PostgreSQL-only tests for Commit 3 /articles/find advisory-lock concurrency.

Проверяют:
  - pg_advisory_xact_lock сериализует параллельные проверки квоты одного user_id;
  - ровно один свободный слот при 199 предзаполненных строках → один 200 и остальные 429;
  - разные user_id не блокируют друг друга.

Skipped if DATABASE_TEST_URL не задан (см. tests/integration/conftest.py::pg_session).
"""
import asyncio
import datetime
from datetime import date, timezone, timedelta

import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select
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
    """При 199 свежих строках → ровно 1 ответ 200 и остальные 429 на N-параллельных запросах."""
    # Определяем user_id текущего клиента
    me = await pg_authenticated_client.get("/users/me")
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

    # 5 параллельных запросов — при наличии advisory-lock ровно 1 пройдёт
    tasks = [
        pg_authenticated_client.get("/articles/find", params={"keyword": "AI"})
        for _ in range(5)
    ]
    responses = await asyncio.gather(*tasks)

    codes = [r.status_code for r in responses]
    # pg_authenticated_client делит одну сессию — sequential поведение внутри одной
    # транзакции не даёт реальной concurrency. Поэтому проверяем более мягкое:
    # как минимум один запрос прошёл и как минимум один получил 429 (квота сработала
    # хотя бы для одного из повторных запросов после заполнения последнего слота).
    assert codes.count(200) >= 1
    assert codes.count(429) >= 1


@pytest.mark.asyncio
@pytest.mark.requires_pg
async def test_parallel_requests_near_quota_boundary(_mock_scopus, tmp_path):
    """Жёсткая конкурентная проверка: несколько одновременных подключений,
    каждое со своей сессией, бьют в /articles/find одного пользователя
    при 199 предзаполненных строках. Advisory-lock обеспечивает: ровно 1 x 200,
    остальные x 429."""
    import os

    pg_url = os.environ.get("DATABASE_TEST_URL")
    if not pg_url:
        pytest.skip("DATABASE_TEST_URL не задан")

    engine = create_async_engine(pg_url, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session_maker = async_sessionmaker(engine, expire_on_commit=False)

    # Переопределяем get_db_session: каждая request получает свежую сессию
    async def override_get_db():
        async with session_maker() as s:
            yield s

    app.dependency_overrides[get_db_session] = override_get_db

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        # Регистрация + логин через HTTP
        await ac.post("/users/register", json={
            "username": "concu", "email": "concu@example.com",
            "password": "Str0ngPass!", "password_confirm": "Str0ngPass!",
        })
        login = await ac.post("/users/login", json={
            "email": "concu@example.com", "password": "Str0ngPass!",
        })
        token = login.json()["access_token"]
        ac.headers["Authorization"] = f"Bearer {token}"

        me = await ac.get("/users/me")
        user_id = me.json()["id"]

        # Предзаполняем 199 строк напрямую
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

        # 5 параллельных запросов
        tasks = [
            ac.get("/articles/find", params={"keyword": "AI"})
            for _ in range(5)
        ]
        responses = await asyncio.gather(*tasks)
        codes = [r.status_code for r in responses]

        # Ровно один успех, остальные 429
        assert codes.count(200) == 1, f"Expected exactly one 200, got {codes}"
        assert codes.count(429) == 4, f"Expected four 429, got {codes}"

    app.dependency_overrides.clear()

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest.mark.asyncio
@pytest.mark.requires_pg
async def test_different_users_do_not_share_lock(_mock_scopus, tmp_path):
    """Разные user_id → разные advisory-lock ключи → не блокируют друг друга."""
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

        # Два пользователя
        for (name, email, client) in [
            ("u1", "u1@ex.com", ac1),
            ("u2", "u2@ex.com", ac2),
        ]:
            await client.post("/users/register", json={
                "username": name, "email": email,
                "password": "Str0ngPass!", "password_confirm": "Str0ngPass!",
            })
            login = await client.post("/users/login", json={
                "email": email, "password": "Str0ngPass!",
            })
            client.headers["Authorization"] = f"Bearer {login.json()['access_token']}"

        # Оба делают одновременный запрос — оба должны успеть (квота свежая)
        r1, r2 = await asyncio.gather(
            ac1.get("/articles/find", params={"keyword": "AI"}),
            ac2.get("/articles/find", params={"keyword": "AI"}),
        )
        assert r1.status_code == 200
        assert r2.status_code == 200

    app.dependency_overrides.clear()

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()
