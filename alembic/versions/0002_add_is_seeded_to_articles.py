"""add is_seeded to articles

Revision ID: 0002_add_is_seeded
Revises: f9a3c1e2b7d4
Create Date: 2026-04-15
"""
from typing import Union

import sqlalchemy as sa
from alembic import op

# Идентификаторы миграции
revision: str = "0002_add_is_seeded"
down_revision: Union[str, None] = "f9a3c1e2b7d4"  # предыдущая: drop_unavailable_scopus_fields
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
