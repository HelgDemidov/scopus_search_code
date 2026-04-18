from typing import AsyncGenerator

import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from app.core.dependencies import get_db_session
from app.main import app
from app.models.article import Article
from app.models.base import Base

# URL тестовой БД — SQLite in-memory через aiosqlite
# Не требует PostgreSQL, изолирован на уровне функции
_TEST_DB_URL = "sqlite+aiosqlite:///:memory:"


async def fetch_article_after_insert(
    session: AsyncSession, doi: str
) -> Article:
    """Загружает ORM-объект статьи из БД по doi после Core INSERT.

    save_many() использует Core-уровень SQLAlchemy (insert().on_conflict_do_update),
    поэтому объекты не попадают в identity_map сессии. Вызывать
    db_session.refresh() на них нельзя — выбросит InvalidRequestError.
    Правильный паттерн: запросить объект заново через SELECT, чтобы
    получить ORM-экземпляр с autoincrement id из БД.
    """
    result = await session.execute(select(Article).where(Article.doi == doi))
    return result.scalar_one()


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


# Алиас для обратной совместимости со старыми тестами, которые ожидают имя async_client
async_client = client


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


@pytest_asyncio.fixture(scope="function")
async def authenticated_client(
    client: AsyncClient,
    logged_in: dict,
) -> AsyncClient:
    """Client с Bearer-токеном в headers — для тестов, требующих авторизованный запрос."""
    # Устанавливаем Authorization header для всех последующих запросов этого клиента
    client.headers.update({"Authorization": f"Bearer {logged_in['access_token']}"})
    # Прокидываем RT cookie через cookies.set(): httpx AsyncClient в ASGI-режиме
    # не пробрасывает cookies={} из аргумента запроса — нужна предустановка на уровне клиента
    client.cookies.set("refresh_token", logged_in["rt_cookie"])
    return client
