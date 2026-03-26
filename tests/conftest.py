from typing import AsyncGenerator

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.dependencies import get_db_session
from app.core.security import create_access_token
from app.models.base import Base

# Импортируем наше приложение и базовый класс моделей
from app.main import app

# Импорт модели пользователя и функции создания JWT-токена для "бэкдор"-фикстуры
from app.models.user import User

# URL для асинхронной in-memory базы данных SQLite.
# :memory: означает, что база живет только в оперативной памяти.
SQLALCHEMY_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

# Создаем движок базы данных для тестов
# poolclass=NullPool отключает пулинг соединений
# Это решает много проблем при тестировании SQLite
engine = create_async_engine(
    SQLALCHEMY_DATABASE_URL, 
    connect_args={"check_same_thread": False},
    poolclass=None,
)

# Фабрика сессий для тестов
TestingSessionLocal = async_sessionmaker(
    autocommit=False, autoflush=False, bind=engine, class_=AsyncSession,
expire_on_commit=False
)

@pytest_asyncio.fixture(scope="function")
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    # Фикстура, которая создает таблицы в In-Memory БД перед каждым тестом,
    # выдает сессию, а после теста - удаляет таблицы

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
    # Асинхронный клиент для эмуляции HTTP-запросов к FastAPI:
    # переопределяет зависимость базы данных, чтобы приложение писало в SQLite
    
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

# "Бэкдор"-фикстура для ускорения интеграционного теста test_articles_api: 
# выдает HTTP-клиент, который УЖЕ авторизован, минует тяжелые операции хеширования пароля
@pytest_asyncio.fixture(scope="function")
async def authenticated_client(async_client: AsyncClient, db_session: AsyncSession) -> AsyncClient:

    # 1. Напрямую создаем пользователя в БД 
    # Пишем в поле hashed_password просто случайную строку, 
    # так как не планируем вызывать ручку /login, которая проверяет хеш
    test_user = User(
        username="fast_tester",
        email="fast@test.com",
        hashed_password="fake_dummy_hash_no_argon2_needed"
    )
    db_session.add(test_user)
    await db_session.commit()
    
    # 2. Напрямую генерируем JWT-токен (это работает за микросекунды)
    token = create_access_token(subject=test_user.email)
    
    # 3. Встраиваем токен по умолчанию во все будущие запросы этого клиента
    async_client.headers.update({"Authorization": f"Bearer {token}"})
    
    return async_client
