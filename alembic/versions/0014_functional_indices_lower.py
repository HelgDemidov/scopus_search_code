"""functional indices lower(affiliation_country) and lower(document_type)

Revision ID: 0014_functional_indices_lower
Revises: 0013_fix_schema_drift
Create Date: 2026-06-27

Cross-filter V2 фильтрует статьи через `lower(column) IN (...)`.
Без функциональных индексов PG делал Seq Scan по всем ~95k строкам:
- country='china': 3580 буферов, 276 ms (Nested Loop по 34k строкам)
- doc_type='article': 3580 буферов, 471 ms (Nested Loop по 68k строкам)

После создания индексов ожидается Index Scan вместо Seq Scan.
"""

from alembic import op

# revision identifiers, used by Alembic.
revision = "0014_functional_indices_lower"
down_revision = "0013_fix_schema_drift"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_articles_lower_affiliation_country ON articles (lower(affiliation_country))"
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_articles_lower_document_type ON articles (lower(document_type))")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_articles_lower_affiliation_country")
    op.execute("DROP INDEX IF EXISTS ix_articles_lower_document_type")
