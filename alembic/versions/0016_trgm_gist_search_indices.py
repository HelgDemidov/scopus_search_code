"""add pg_trgm GiST indices on articles.title/author for ILIKE search

Revision ID: 0016_trgm_gist_search_indices
Revises: 0015_trim_search_history_over_limit
Create Date: 2026-07-09

Шаг 2 индексирования под нагрузку (docs/project_context/scopus-search-feedback-2026-07-03.md).
Root cause (прогон 2026-07-09): GET /articles/?search= — title/author ILIKE '%...%' с ведущим
wildcard'ом не может использовать ни один btree (в т.ч. ix_articles_lower_*). Применяется только
после Шага 1 (кап точного COUNT) — тот один не закрыл порог P95<500ms/P99<1000ms.

GiST, не GIN (осознанный выбор по итогам обсуждения trade-off'ов): меньше по размеру, дешевле на
запись (bulk-апдейты сидера раз в 2ч, не realtime OLTP) — не требует pending-buffer/autovacuum-
внимания GIN; цена — чуть медленнее и lossy-чтение (доп. recheck строк на выходе из индекса).

CONCURRENTLY обязателен — build индекса не блокирует таблицу на запись на живом проде.
"""

from alembic import op

# revision identifiers, used by Alembic.
revision = "0016_trgm_gist_search_indices"
down_revision = "0015_trim_search_history_over_limit"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # CREATE EXTENSION — обычная транзакционная DDL, коммитится при входе в autocommit_block ниже
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")

    with op.get_context().autocommit_block():
        op.execute(
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_articles_title_trgm "
            "ON articles USING gist (title gist_trgm_ops)"
        )
        op.execute(
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_articles_author_trgm "
            "ON articles USING gist (author gist_trgm_ops)"
        )


def downgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute("DROP INDEX CONCURRENTLY IF EXISTS ix_articles_title_trgm")
        op.execute("DROP INDEX CONCURRENTLY IF EXISTS ix_articles_author_trgm")
