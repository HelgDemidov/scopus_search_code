from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text


from app.core.dependencies import get_db_session

router = APIRouter(prefix="/health", tags=["Health"])


@router.api_route(
    "",  # регистрируется как /health — лёгкая проверка живости процесса
    methods=["GET"],
    status_code=status.HTTP_200_OK,
)
async def health_check() -> dict[str, str]:
    # Проверяет только то, что процесс запущен и отвечает — без обращения к БД
    # Используется в e2e.yml как предварительный smoke-check перед запуском pytest
    return {"status": "ok"}


@router.api_route(
    "/db",
    methods=["GET"],  # HEAD обрабатывается Starlette автоматически для любого GET
    status_code=status.HTTP_200_OK,
)
async def health_db(session: AsyncSession = Depends(get_db_session)) -> dict[str, str]:
    # Легкая проверка доступности базы данных
    # Если база недоступна, здесь упадет исключение, и сервис вернет 5xx
    await session.execute(text("SELECT 1"))
    return {"status": "ok"}
