# app/models/search_history.py
import datetime
import json
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Index, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func
from sqlalchemy.types import TypeDecorator

from app.models.base import Base


class JsonField(TypeDecorator):
    """JSONB на PostgreSQL, TEXT+JSON-сериализация на SQLite (для тестов)"""

    impl = Text
    cache_ok = True

    def load_dialect_impl(self, dialect: Any) -> Any:
        # Возвращаем нативный JSONB для PG и TEXT для всех остальных диалектов
        if dialect.name == "postgresql":
            from sqlalchemy.dialects.postgresql import JSONB

            return dialect.type_descriptor(JSONB())
        return dialect.type_descriptor(Text())

    def process_bind_param(self, value: Any, dialect: Any) -> Any:
        # PG получает dict напрямую — JSONB-драйвер сериализует сам
        if dialect.name == "postgresql":
            return value
        if value is None:
            return "{}"
        if isinstance(value, str):
            return value
        return json.dumps(value, ensure_ascii=False)

    def process_result_value(self, value: Any, dialect: Any) -> Any:
        # PG возвращает dict напрямую из JSONB — ничего не делаем
        if dialect.name == "postgresql":
            return value
        if value is None:
            return {}
        if isinstance(value, dict):
            return value
        return json.loads(value)


class SearchHistory(Base):
    __tablename__ = "search_history"

    # Индекс без postgresql_ops — SQLite не поддерживает, PG создаст btree по умолчанию
    # Порядок DESC при запросах достигается через ORDER BY в SQL, не через индекс
    __table_args__ = (
        Index(
            "ix_search_history_user_created",
            "user_id",
            "created_at",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # Каскадное удаление истории вместе с пользователем
    user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )

    query: Mapped[str] = mapped_column(Text, nullable=False)

    # Итоговый CQL-запрос, отправленный в Scopus API — включает keyword + все фильтры.
    # NULL для старых записей, созданных до введения этого поля
    scopus_query: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Метка времени записи — основа скользящего окна квоты
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    result_count: Mapped[int] = mapped_column(Integer, nullable=False)

    # JsonField: JSONB на PG, TEXT+сериализация на SQLite
    # default=dict — Python-уровень; server_default убран (PG-литерал несовместим с SQLite)
    filters: Mapped[dict] = mapped_column(
        JsonField,
        nullable=False,
        default=dict,
    )

    def __repr__(self) -> str:
        return f"<SearchHistory(user_id={self.user_id}, query='{self.query[:30]}')>"
