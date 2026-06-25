"""add user_id index to refresh_tokens

Revision ID: 0010
Revises: 0009_add_scopus_query_to_search_history
Create Date: 2026-06-25
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0010_add_user_id_index_to_refresh_tokens"
down_revision: Union[str, None] = "0009_add_scopus_query_to_search_history"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        "ix_refresh_tokens_user_id",
        "refresh_tokens",
        ["user_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_refresh_tokens_user_id", table_name="refresh_tokens")
