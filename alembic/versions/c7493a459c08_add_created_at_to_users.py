"""add created_at to users

Revision ID: c7493a459c08
Revises: e0e976b018a8
Create Date: 2026-03-22 10:59:07.802950

"""
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'c7493a459c08'
down_revision: Union[str, Sequence[str], None] = 'e0e976b018a8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ДОБАВЛЯЕМ КОЛОНКУ
    op.add_column('users', sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False))


def downgrade() -> None:
    # УДАЛЯЕМ КОЛОНКУ (для отката)
    op.drop_column('users', 'created_at')
