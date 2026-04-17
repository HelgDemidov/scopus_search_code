import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.refresh_token import RefreshToken

# Время жизни refresh token — 30 дней
REFRESH_TOKEN_EXPIRE_DAYS = 30


async def create_refresh_token(user_id: int, session: AsyncSession) -> str:
    """Создает новый refresh token и сохраняет его в БД."""
    # Генерируем криптографически стойкий непрозрачный токен
    token_value = secrets.token_urlsafe(64)
    expires = datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)

    rt = RefreshToken(
        token=token_value,
        user_id=user_id,
        expires_at=expires,
        revoked=False,
    )
    session.add(rt)
    await session.commit()
    return token_value


async def get_valid_refresh_token(
    token_value: str, session: AsyncSession
) -> RefreshToken | None:
    """Возвращает действующий RT или None, если он невалиден / истёк / отозван."""
    result = await session.execute(
        select(RefreshToken).where(RefreshToken.token == token_value)
    )
    rt = result.scalar_one_or_none()

    if rt is None or rt.revoked:
        return None

    # Нормализуем expires_at к UTC: SQLite возвращает naive datetime (tzinfo=None),
    # PostgreSQL возвращает aware datetime. Прямое сравнение двух типов — TypeError.
    # replace(tzinfo=UTC) безопасен для naive: не сдвигает значение, только добавляет метку.
    expires_at_utc = (
        rt.expires_at.replace(tzinfo=timezone.utc)
        if rt.expires_at.tzinfo is None
        else rt.expires_at
    )
    if expires_at_utc < datetime.now(timezone.utc):
        return None
    return rt


async def revoke_refresh_token(token_value: str, session: AsyncSession) -> None:
    """Помечает RT как отозванный — используется при logout и ротации."""
    result = await session.execute(
        select(RefreshToken).where(RefreshToken.token == token_value)
    )
    rt = result.scalar_one_or_none()
    if rt:
        rt.revoked = True
        await session.commit()
