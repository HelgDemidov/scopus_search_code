import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.password_reset_token import PasswordResetToken

# NIST SP 800-63B: одноразовые коды — TTL не более 10 минут для высокорисковых операций,
# 1 час — приемлемый баланс UX/безопасности для email-подтверждений с ограниченной энтропией
PASSWORD_RESET_EXPIRE_SECONDS = 3600


async def create_password_reset_token(user_id: int, session: AsyncSession) -> str:
    """Генерирует токен сброса пароля и сохраняет в БД."""
    # 256 бит энтропии — гарантированно устойчив к брутфорсу при любом разумном TTL
    token_value = secrets.token_urlsafe(32)
    expires = datetime.now(timezone.utc) + timedelta(seconds=PASSWORD_RESET_EXPIRE_SECONDS)
    prt = PasswordResetToken(
        token=token_value,
        user_id=user_id,
        expires_at=expires,
        used=False,
    )
    session.add(prt)
    await session.commit()
    return token_value


async def get_valid_reset_token(token: str, session: AsyncSession) -> PasswordResetToken | None:
    """Возвращает токен, если он существует, не использован и не истёк."""
    result = await session.execute(
        select(PasswordResetToken).where(PasswordResetToken.token == token)
    )
    prt = result.scalar_one_or_none()
    if prt is None or prt.used:
        return None

    # SQLite возвращает naive datetime — нормализуем к UTC без сдвига значения
    expires_at_utc = (
        prt.expires_at.replace(tzinfo=timezone.utc)
        if prt.expires_at.tzinfo is None
        else prt.expires_at
    )
    if expires_at_utc < datetime.now(timezone.utc):
        return None
    return prt
