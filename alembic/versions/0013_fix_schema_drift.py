"""fix schema drift: NOT NULL on created_at, search_history index without DESC

Revision ID: 0013_fix_schema_drift
Revises: 0012_add_last_offset_to_seeder_keywords
Create Date: 2026-06-26

Устраняет расхождения между моделями SQLAlchemy и реальной схемой БД,
выявленные alembic check:

1. refresh_tokens.created_at и password_reset_tokens.created_at созданы как
   nullable (без явного nullable=False в миграциях 0003/0011), тогда как
   модели используют Mapped[datetime] (NOT NULL). server_default=func.now()
   гарантирует, что NULL-строк нет → ALTER безопасен.

2. ix_search_history_user_created создан в миграции 0005 с created_at DESC,
   но модель объявляет индекс без DESC для совместимости с SQLite в тестах.
   ORDER BY created_at DESC достигается в SQL-запросе, а не в индексе.
"""

from typing import Union

import sqlalchemy as sa

from alembic import op

revision: str = "0013_fix_schema_drift"
down_revision: Union[str, None] = "0012_add_last_offset_to_seeder_keywords"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. NOT NULL для created_at — server_default гарантирует отсутствие NULL-строк
    op.alter_column(
        "refresh_tokens",
        "created_at",
        existing_type=sa.DateTime(timezone=True),
        nullable=False,
    )
    op.alter_column(
        "password_reset_tokens",
        "created_at",
        existing_type=sa.DateTime(timezone=True),
        nullable=False,
    )

    # 2. Пересоздаём индекс без DESC — SQLite-совместимо; порядок в запросах
    # достигается через ORDER BY, не через индекс
    op.drop_index("ix_search_history_user_created", table_name="search_history")
    op.create_index(
        "ix_search_history_user_created",
        "search_history",
        ["user_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_search_history_user_created", table_name="search_history")
    op.create_index(
        "ix_search_history_user_created",
        "search_history",
        ["user_id", sa.text("created_at DESC")],
    )
    op.alter_column(
        "password_reset_tokens",
        "created_at",
        existing_type=sa.DateTime(timezone=True),
        nullable=True,
    )
    op.alter_column(
        "refresh_tokens",
        "created_at",
        existing_type=sa.DateTime(timezone=True),
        nullable=True,
    )
