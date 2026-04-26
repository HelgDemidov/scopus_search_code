"""rename date→publication_date, add missing Scopus fields to articles

Revision ID: 0005b_rename_date_add_scopus_fields
Revises: 0005_add_search_history
Create Date: 2026-04-23 19:20:00.000000

Закрывает расхождение между Article-моделью (db-refactoring) и реальной
схемой staging-БД, которая была собрана цепочкой миграций без этого шага.

Что делает эта миграция:
1. RENAME COLUMN date → publication_date
   Модель объявляет `publication_date`, БД содержит `date`.
   Без этого миграция 0006 падает на CREATE INDEX (column does not exist).

2. ADD COLUMN journal VARCHAR(500) — прим:publicationName
3. ADD COLUMN cited_by_count INTEGER — citedby-count
4. ADD COLUMN document_type VARCHAR(100) — subtypeDescription
5. ADD COLUMN open_access BOOLEAN — openaccess
6. ADD COLUMN affiliation_country VARCHAR(100) — affiliation[0].affiliation-country

Все новые колонки nullable=True: данные не всегда присутствуют в Scopus API
и не требуют обратной заливки для существующих строк.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# Идентификаторы ревизии — строятся в цепочку Alembic
revision: str = '0005b_rename_date_add_scopus_fields'
down_revision: Union[str, Sequence[str], None] = '0005_add_search_history'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Переименование: date → publication_date
    # Необходимо до миграции 0006, которая строит индекс по publication_date
    op.alter_column('articles', 'date', new_column_name='publication_date')

    # 2-6. Добавление наукометрических полей, которых нет в текущей схеме БД.
    # Все nullable=True: API возвращает их не всегда; существующие строки
    # получат NULL без необходимости backfill-а
    op.add_column('articles', sa.Column('journal', sa.String(500), nullable=True))
    op.add_column('articles', sa.Column('cited_by_count', sa.Integer(), nullable=True))
    op.add_column('articles', sa.Column('document_type', sa.String(100), nullable=True))
    op.add_column('articles', sa.Column('open_access', sa.Boolean(), nullable=True))
    op.add_column('articles', sa.Column('affiliation_country', sa.String(100), nullable=True))


def downgrade() -> None:
    # Порядок: сначала удаляем добавленные колонки, потом возвращаем имя
    op.drop_column('articles', 'affiliation_country')
    op.drop_column('articles', 'open_access')
    op.drop_column('articles', 'document_type')
    op.drop_column('articles', 'cited_by_count')
    op.drop_column('articles', 'journal')

    # Возвращаем исходное имя колонки
    op.alter_column('articles', 'publication_date', new_column_name='date')
