import logging

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text


from app.core.dependencies import get_db_session

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/health", tags=["Health"])


@router.api_route(
    "/db",
    methods=["GET", "HEAD"],
    status_code=status.HTTP_200_OK,
)
async def health_db(session: AsyncSession = Depends(get_db_session)) -> dict[str, str]:
    # Легкая проверка доступности базы данных.
    # Если база недоступна, здесь упадет исключение, и сервис вернет 5xx.
    logger.info("health_db: endpoint called, acquiring DB session")
    await session.execute(text("SELECT 1"))
    logger.info("health_db: DB query completed successfully")
    return {"status": "ok"}
