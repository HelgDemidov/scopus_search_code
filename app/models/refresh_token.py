from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # Непрозрачный UUID-токен — не JWT, не декодируется на клиенте
    token: Mapped[str] = mapped_column(String(128), unique=True, index=True, nullable=False)

    # Владелец токена — каскадное удаление при удалении пользователя
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)

    # Срок истечения — проверяется при каждом обращении к /auth/refresh
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    # Флаг отзыва — RT помечается revoked=True при ротации или logout
    revoked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Время создания — для аудита и очистки устаревших записей
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    def __repr__(self) -> str:
        return f"<RefreshToken(id={self.id}, user_id={self.user_id}, revoked={self.revoked})>"
