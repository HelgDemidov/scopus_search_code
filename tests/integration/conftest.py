# tests/integration/conftest.py
import os
from typing import AsyncGenerator

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from app.core.dependencies import get_db_session
from app.main import app
from app.models.base import Base

# Переменная задаётся в GitHub Actions env для джоба test-pg
# Локально: export DATABASE_TEST_URL=postgresql+asyncpg://...
_PG_URL = os.environ.get("DATABASE_TEST_URL")


@pytest_asyncio.fixture(scope="function")
async def pg_session() -> AsyncGenerator[AsyncSession, None]:
    # Пропускаем тест если PostgreSQL не сконфигурирован
    if not _PG_URL:
        pytest.skip("DATABASE_TEST_URL не задан — PostgreSQL-тесты пропущены")

    engine = create_async_engine(_PG_URL, echo=False)

    # Создаем все таблицы с нуля для каждого теста — полная изоляция
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSession(engine, expire_on_commit=False) as session:
        yield session

    # Убираем все таблицы после теста — следующий тест получит чистую схему
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest_asyncio.fixture(scope="function")
async def pg_client(pg_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    # FastAPI использует pg_session вместо продакшн-сессии
    async def override_get_db() -> AsyncGenerator[AsyncSession, None]:
        yield pg_session

    app.dependency_overrides[get_db_session] = override_get_db
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        yield ac
    app.dependency_overrides.clear()


@pytest_asyncio.fixture(scope="function")
async def pg_registered_user(pg_client: AsyncClient) -> dict:
    # Регистрирует тестового пользователя через HTTP на PostgreSQL-бэкенде
    payload = {
        "username": "testuser",
        "email": "test@example.com",
        "password": "Str0ngPass!",
        "password_confirm": "Str0ngPass!",
    }
    resp = await pg_client.post("/users/register", json=payload)
    assert resp.status_code == 201, f"Register failed: {resp.text}"
    return {"email": payload["email"], "password": payload["password"]}


@pytest_asyncio.fixture(scope="function")
async def pg_logged_in(pg_client: AsyncClient, pg_registered_user: dict) -> dict:
    # Логин на PostgreSQL-бэкенде, возвращает access_token и rt_cookie
    resp = await pg_client.post(
        "/users/login",
        json={"email": pg_registered_user["email"], "password": pg_registered_user["password"]},
    )
    assert resp.status_code == 200, f"Login failed: {resp.text}"
    access_token = resp.json()["access_token"]
    rt_cookie = resp.cookies.get("refresh_token")
    assert rt_cookie is not None
    return {"access_token": access_token, "rt_cookie": rt_cookie}


@pytest_asyncio.fixture(scope="function")
async def pg_authenticated_client(pg_client: AsyncClient, pg_logged_in: dict) -> AsyncClient:
    # Клиент с Bearer-токеном — для тестов, требующих авторизации
    pg_client.headers.update({"Authorization": f"Bearer {pg_logged_in['access_token']}"})
    pg_client.cookies.set("refresh_token", pg_logged_in["rt_cookie"])
    return pg_client