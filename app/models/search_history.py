import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func, text

from app.models.base import Base


class SearchHistory(Base):
    __tablename__ = "search_history"

    # Составной индекс покрывает оба сценария: "последние 100 строк" и скользящее окно квоты
    __table_args__ = (
        Index(
            "ix_search_history_user_created",
            "user_id",
            "created_at",
            postgresql_ops={"created_at": "DESC"},
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # Внешний ключ на users.id — каскадное удаление истории вместе с пользователем
    user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )

    query: Mapped[str] = mapped_column(Text, nullable=False)                           # поисковый запрос пользователя

    # Метка времени записи — используется как основа скользящего окна квоты
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    result_count: Mapped[int] = mapped_column(Integer, nullable=False)                 # сколько статей вернул запрос

    # JSONB хранит фильтры запроса: year_from, year_to, doc_types, open_access, country
    # server_default '{}' валиден когда фильтры не переданы
    filters: Mapped[dict] = mapped_column(
        JSONB,
        nullable=False,
        server_default=text("'{}'"),
    )

    def __repr__(self) -> str:
        return f"<SearchHistory(user_id={self.user_id}, query='{self.query[:30]}')>"
