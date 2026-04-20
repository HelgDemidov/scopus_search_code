"""add search_history table

Revision ID: 0005_add_search_history
Revises: d2c4aaedfd4e
Create Date: 2026-04-20 19:28:00.000000

Создаем таблицу search_history для хранения истории поисковых запросов
пользователей и подсчёта квоты (200 запросов / 7 скользящих дней).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic
revision: str = '0005_add_search_history'
down_revision: Union[str, Sequence[str], None] = 'd2c4aaedfd4e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Создаем таблицу search_history со всеми необходимыми полями
    op.create_table(
        'search_history',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('query', sa.Text(), nullable=False),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()'),
            nullable=False,
        ),
        sa.Column('result_count', sa.Integer(), nullable=False),
        sa.Column(
            'filters',
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ['user_id'],
            ['users.id'],
            ondelete='CASCADE',
        ),
        sa.PrimaryKeyConstraint('id'),
    )

    # Составной индекс: user_id + created_at DESC — покрывает оба паттерна доступа:
    # 1. SELECT ... WHERE user_id=X ORDER BY created_at DESC LIMIT 100
    # 2. SELECT count(*) WHERE user_id=X AND created_at >= now() - interval '7 days'
    op.create_index(
        'ix_search_history_user_created',
        'search_history',
        ['user_id', sa.text('created_at DESC')],
    )


def downgrade() -> None:
    # Удаляем индекс перед таблицей
    op.drop_index('ix_search_history_user_created', table_name='search_history')
    op.drop_table('search_history')
