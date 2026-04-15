"""add is_seeded to articles

Revision ID: 0002_add_is_seeded
Revises: a1b2c3d4e5f6
Create Date: 2026-04-15
"""
from typing import Union

import sqlalchemy as sa
from alembic import op

# Идентификаторы миграции
revision: str = "0002_add_is_seeded"
down_revision: Union[str, None] = "a1b2c3d4e5f6"  # предыдущая: create seeder_keywords table
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Добавляем колонку is_seeded с дефолтом FALSE для всех существующих строк
    op.add_column(
        "articles",
        sa.Column(
            "is_seeded",
            sa.Boolean(),
            nullable=False,
            server_default="false",
        ),
    )


def downgrade() -> None:
    op.drop_column("articles", "is_seeded")
