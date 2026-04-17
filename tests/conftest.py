from typing import AsyncGenerator

import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from app.core.dependencies import get_db_session
from app.main import app
from app.models.base import Base

# URL тестовой БД — SQLite in-memory через aiosqlite
# Не требует PostgreSQL, изолирован на уровне функции
_TEST_DB_URL = "sqlite+aiosqlite:///:memory:"


@pytest_asyncio.fixture(scope="function")
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    """Создает изолированную in-memory БД для каждого теста."""
    # Отдельный движок на каждый тест — полная изоляция данных
    engine = create_async_engine(_TEST_DB_URL, echo=False)
    async with engine.begin() as conn:
        # Создаем все таблицы: users, refresh_tokens, articles, ...
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSession(engine, expire_on_commit=False) as session:
        yield session

    # Очищаем после теста
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest_asyncio.fixture(scope="function")
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    """AsyncClient с переопределенной зависимостью БД — все эндпоинты используют тестовую сессию."""
    # Переопределяем get_db_session: FastAPI будет использовать тестовую сессию
    async def override_get_db() -> AsyncGenerator[AsyncSession, None]:
        yield db_session

    app.dependency_overrides[get_db_session] = override_get_db

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        yield ac

    # Очищаем override после теста
    app.dependency_overrides.clear()


@pytest_asyncio.fixture(scope="function")
async def registered_user(client: AsyncClient) -> dict:
    """Регистрирует тестового пользователя, возвращает credentials."""
    payload = {
        "username": "testuser",
        "email": "test@example.com",
        "password": "Str0ngPass!",
        "password_confirm": "Str0ngPass!",
    }
    resp = await client.post("/users/register", json=payload)
    assert resp.status_code == 201, f"Register failed: {resp.text}"
    return {"email": payload["email"], "password": payload["password"]}


@pytest_asyncio.fixture(scope="function")
async def logged_in(client: AsyncClient, registered_user: dict) -> dict:
    """Логинит пользователя, возвращает AT и RT cookie."""
    resp = await client.post(
        "/users/login",
        content=f"username={registered_user['email']}&password={registered_user['password']}",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert resp.status_code == 200, f"Login failed: {resp.text}"

    access_token = resp.json()["access_token"]
    # httpx сохраняет cookie автоматически — дополнительно извлекаем значение для проверок
    rt_cookie = resp.cookies.get("refresh_token")
    assert rt_cookie is not None, "RT cookie должен быть установлен при login"

    return {"access_token": access_token, "rt_cookie": rt_cookie}
