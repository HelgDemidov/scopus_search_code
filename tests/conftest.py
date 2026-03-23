import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from typing import AsyncGenerator

# Импортируем наше приложение и базовый класс моделей
from app.main import app
from app.infrastructure.database import Base
from app.core.dependencies import get_db_session

# URL для асинхронной in-memory базы данных SQLite.
# :memory: означает, что база живет только в оперативной памяти.
SQLALCHEMY_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

# Создаем движок базы данных для тестов
# poolclass=NullPool отключает пулинг соединений, что решает много проблем при тестировании SQLite
engine = create_async_engine(
    SQLALCHEMY_DATABASE_URL, 
    connect_args={"check_same_thread": False},
    poolclass=None,
)

# Фабрика сессий для тестов
TestingSessionLocal = async_sessionmaker(
    autocommit=False, autoflush=False, bind=engine, class_=AsyncSession
)

@pytest_asyncio.fixture(scope="function")
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    # Фикстура, которая создает таблицы в In-Memory БД перед каждым тестом, выдает сессию, а после теста - удаляет таблицы

    # Создаем таблицы (эквивалент alembic upgrade head, но быстрее и для SQLite)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Выдаем сессию тесту
    async with TestingSessionLocal() as session:
        yield session

    # Удаляем таблицы после теста (очистка состояния)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture(scope="function")
async def async_client(db_session: AsyncSession):
    # Асинхронный клиент для эмуляции HTTP-запросов к FastAPI (ереопределяет зависимость базы данных, чтобы приложение писало в SQLite)
    
    # Функция для подмены оригинальной базы данных на нашу тестовую
    async def override_get_db():
        yield db_session

    # dependency_overrides - встроенный механизм FastAPI для подмены DI при тестировании
    app.dependency_overrides[get_db_session] = override_get_db

    # Создаем асинхронный HTTP-клиент, подключая его напрямую к ASGI приложению
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        yield client

    # Убираем подмену после теста
    app.dependency_overrides.clear()
