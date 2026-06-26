"""add last_offset to seeder_keywords

Revision ID: 0012_add_last_offset_to_seeder_keywords
Revises: 0011_create_password_reset_tokens_table
Create Date: 2026-06-26

Добавляет колонку last_offset в seeder_keywords для поддержки пагинации
через Scopus start-параметр. Существующие строки получают last_offset=25:
страница start=0 уже была взята при первом сидировании каждой фразы.
"""

from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "0012_add_last_offset_to_seeder_keywords"
down_revision: Union[str, None] = "0011_create_password_reset_tokens_table"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "seeder_keywords",
        sa.Column("last_offset", sa.Integer(), nullable=False, server_default="0"),
    )
    # Существующие фразы: первая страница (start=0) уже забрана → начинаем со страницы 2
    op.execute("UPDATE seeder_keywords SET last_offset = 25")


def downgrade() -> None:
    op.drop_column("seeder_keywords", "last_offset")
