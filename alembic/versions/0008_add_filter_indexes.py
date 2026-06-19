"""add indexes for filter columns on articles table

Revision ID: 0008_add_filter_indexes
Revises: 0007_drop_article_legacy_columns
Create Date: 2026-06-19

Добавляет индексы для колонок таблицы articles, используемых
в серверной фильтрации каталога:
- document_type  — обычный BTree-индекс (фильтр по типу документа)
- affiliation_country — обычный BTree-индекс (фильтр по стране аффилиации)
- open_access    — частичный (partial) индекс только по строкам WHERE open_access = true,
                   поскольку запросы по open_access всегда ищут значение true
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0008_add_filter_indexes"
down_revision: Union[str, Sequence[str], None] = "0007_drop_article_legacy_columns"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Индекс для фильтрации по типу документа
    op.create_index(
        "ix_articles_document_type",
        "articles",
        ["document_type"],
    )

    # Индекс для фильтрации по стране аффилиации автора
    op.create_index(
        "ix_articles_affiliation_country",
        "articles",
        ["affiliation_country"],
    )

    # Частичный индекс — покрывает только строки с open_access = true,
    # что минимизирует его размер и ускоряет именно этот сценарий фильтрации
    op.create_index(
        "ix_articles_open_access_true",
        "articles",
        ["open_access"],
        postgresql_where=sa.text("open_access = true"),
    )


def downgrade() -> None:
    # Удаляем индексы в обратном порядке
    op.drop_index("ix_articles_open_access_true", table_name="articles")
    op.drop_index("ix_articles_affiliation_country", table_name="articles")
    op.drop_index("ix_articles_document_type", table_name="articles")
