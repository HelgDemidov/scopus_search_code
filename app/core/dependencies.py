from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.database import async_session_maker


async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    
    # Dependency: создаёт сессию БД на время одного запроса
    # yield — ключевое слово: FastAPI получит сессию, выполнит запрос
    # Потом автоматически закроет сессию в блоке finally
    
    async with async_session_maker() as session:
        yield session
