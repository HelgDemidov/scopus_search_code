"""create seeder_keywords table

Revision ID: a1b2c3d4e5f6
Revises: c7493a459c08
Create Date: 2026-04-14 19:20:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# Идентификаторы ревизии — используются Alembic для построения цепочки миграций
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = 'c7493a459c08'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Создаем таблицу для хранения истории поисковых фраз сидера
    op.create_table(
        'seeder_keywords',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('keyword', sa.String(255), nullable=False),
        sa.Column('cluster', sa.String(100), nullable=False),
        sa.Column('articles_found', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('used_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('keyword', name='uq_seeder_keywords_keyword')
    )


def downgrade() -> None:
    # Удаляем таблицу при откате миграции
    op.drop_table('seeder_keywords')
