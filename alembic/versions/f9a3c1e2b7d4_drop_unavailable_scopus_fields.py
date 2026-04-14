"""drop_unavailable_scopus_fields

Revision ID: f9a3c1e2b7d4
Revises: a1b2c3d4e5f6
Create Date: 2026-04-15 00:00:00.000000

Удаляем поля, недоступные в Scopus Search API при бесплатном ключе:
- author_keywords (authkeywords)  — только в view=COMPLETE
- abstract        (dc:description) — только в view=COMPLETE
- fund_sponsor    (fund-sponsor)   — только в view=COMPLETE
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# Идентификаторы ревизии
revision: str = 'f9a3c1e2b7d4'
down_revision: Union[str, Sequence[str], None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Удаляем три колонки, которые никогда не заполняются с бесплатным API-ключом
    op.drop_column('articles', 'author_keywords')
    op.drop_column('articles', 'abstract')
    op.drop_column('articles', 'fund_sponsor')


def downgrade() -> None:
    # Возвращаем колонки при откате — восстанавливаем как nullable,
    # данные не восстанавливаются (при апгрейде они были NULL)
    op.add_column('articles', sa.Column('fund_sponsor', sa.String(length=255), nullable=True))
    op.add_column('articles', sa.Column('abstract', sa.Text(), nullable=True))
    op.add_column('articles', sa.Column('author_keywords', sa.Text(), nullable=True))
