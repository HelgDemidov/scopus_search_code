from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text


from app.core.dependencies import get_db_session

router = APIRouter(prefix="/health", tags=["Health"])


@router.api_route(
    "/db",
    methods=["GET", "HEAD"],
    status_code=status.HTTP_200_OK,
)
async def health_db(session: AsyncSession = Depends(get_db_session)) -> dict[str, str]:
    # Лёгкая проверка доступности базы данных.
    # Если база недоступна, здесь упадёт исключение, и сервис вернёт 5xx.
    await session.execute(text("SELECT 1"))
    return {"status": "ok"}
