"""add scopus_query column to search_history

Revision ID: 0009_add_scopus_query_to_search_history
Revises: 0008_add_filter_indexes
Create Date: 2026-06-19

Добавляет колонку scopus_query TEXT NULL в таблицу search_history.
Колонка хранит итоговый CQL-запрос, отправленный в Scopus API,
включая ключевое слово и все активные фильтры. NULL для записей,
созданных до введения этого поля.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0009_add_scopus_query_to_search_history"
down_revision: Union[str, Sequence[str], None] = "0008_add_filter_indexes"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Добавляем TEXT NULL — существующие строки получат NULL автоматически
    op.add_column(
        "search_history",
        sa.Column("scopus_query", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("search_history", "scopus_query")
