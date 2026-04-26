"""drop article legacy columns: is_seeded, keyword

Revision ID: 0007_drop_article_legacy_columns
Revises: 0006_refactor_article_ownership
Create Date: 2026-04-26

Фаза 3 рефакторинга владения статьями.
Удаляет устаревшие колонки articles.keyword и articles.is_seeded,
которые перестали использоваться приложением начиная с миграции 0006.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0007_drop_article_legacy_columns"
down_revision: Union[str, Sequence[str], None] = "0006_refactor_article_ownership"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Удаляем устаревшие колонки сидера — данные уже перенесены в catalog_articles
    op.drop_column("articles", "is_seeded")
    op.drop_column("articles", "keyword")


def downgrade() -> None:
    # Восстанавливаем keyword как nullable=True — исходные значения потеряны
    op.add_column(
        "articles",
        sa.Column("keyword", sa.String(length=100), nullable=True),
    )
    # Восстанавливаем is_seeded с server_default=false()
    op.add_column(
        "articles",
        sa.Column(
            "is_seeded",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )