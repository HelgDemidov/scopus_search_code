"""add plain btree index on articles.publication_date

Revision ID: 0017_publication_date_index
Revises: 0016_trgm_gist_search_indices
Create Date: 2026-07-09

Шаг 3 индексирования под нагрузку (docs/project_context/scopus-search-feedback-2026-07-03.md).
Сопровождает переход get_journal_impact() на sargable-предикат
(publication_date < make_date(max_year+1,1,1)) вместо extract(year FROM publication_date) —
без него sargable-предикат по-прежнему упирался бы в seq scan, просто без функции над колонкой.
Обычный btree, без выражения — единственный существующий индекс с publication_date
(ix_articles_no_doi_unique) составной с title как ведущей колонкой, для диапазона по одной
дате бесполезен.

CONCURRENTLY обязателен — build индекса не блокирует таблицу на запись на живом проде.
"""

from alembic import op

# revision identifiers, used by Alembic.
revision = "0017_publication_date_index"
down_revision = "0016_trgm_gist_search_indices"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute(
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_articles_publication_date "
            "ON articles (publication_date)"
        )


def downgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute("DROP INDEX CONCURRENTLY IF EXISTS ix_articles_publication_date")
