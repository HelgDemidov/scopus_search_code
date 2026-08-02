"""switch ix_articles_title_trgm/ix_articles_author_trgm from GiST to GIN

Revision ID: 0018_trgm_gin_indices
Revises: 0017_publication_date_index
Create Date: 2026-08-02

docs/backend-performance/catalog-search-latency/spec.md §1/Шаг 2. Индексы весили больше самих
данных (articles: 181МБ индексов на 65МБ таблицы, 73.5% объёма) — почти не помещались в
shared_buffers=224МБ (Supabase Free), вытесняя из кэша данные таблиц. Измерено эмпирически на
изолированном тестовом Neon-проекте (та же схема/данные): title_trgm 128МБ (GiST) → 45МБ (GIN,
-65%), author_trgm 15МБ (GiST) → 7.2МБ (GIN, -53%). Семантика поиска НЕ меняется — тот же
ILIKE-подстрочный recall, только физический тип индекса (не путать с tsvector+GIN — другая
задача, вне скоупа этого ТЗ).

Разворачивает решение "GiST, не GIN" из 0016_trgm_gist_search_indices — обоснованно ТОЛЬКО
потому, что сидер сейчас заморожен (.github/workflows/seeder.yml): исходный аргумент "GIN дороже
на запись при bulk-апдейтах раз в 2ч" временно неактуален. Если сидер возобновится — переоценить
write-cost trade-off (gin_pending_list_limit/fastupdate) заранее, а не постфактум.

Zero-downtime: новые GIN-индексы строятся CONCURRENTLY под временным именем ДО удаления старых
GiST — работающий trgm-индекс доступен планировщику на всём протяжении миграции. ALTER INDEX
RENAME — метаданные, мгновенно, без перестройки.

ix_articles_title_trgm/ix_articles_author_trgm остаются в _MIGRATION_ONLY_INDICES (alembic/env.py)
без изменений — оба имени уже исключены из autogenerate-сравнения независимо от access method.
"""

from alembic import op

# revision identifiers, used by Alembic.
revision = "0018_trgm_gin_indices"
down_revision = "0017_publication_date_index"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.get_context().autocommit_block():
        # Строим GIN под временным именем — старый GiST остаётся рабочим для планировщика
        op.execute(
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_articles_title_trgm_gin "
            "ON articles USING gin (title gin_trgm_ops)"
        )
        op.execute(
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_articles_author_trgm_gin "
            "ON articles USING gin (author gin_trgm_ops)"
        )

        op.execute("DROP INDEX CONCURRENTLY IF EXISTS ix_articles_title_trgm")
        op.execute("DROP INDEX CONCURRENTLY IF EXISTS ix_articles_author_trgm")

        op.execute("ALTER INDEX ix_articles_title_trgm_gin RENAME TO ix_articles_title_trgm")
        op.execute("ALTER INDEX ix_articles_author_trgm_gin RENAME TO ix_articles_author_trgm")


def downgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute(
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_articles_title_trgm_gist "
            "ON articles USING gist (title gist_trgm_ops)"
        )
        op.execute(
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_articles_author_trgm_gist "
            "ON articles USING gist (author gist_trgm_ops)"
        )

        op.execute("DROP INDEX CONCURRENTLY IF EXISTS ix_articles_title_trgm")
        op.execute("DROP INDEX CONCURRENTLY IF EXISTS ix_articles_author_trgm")

        op.execute("ALTER INDEX ix_articles_title_trgm_gist RENAME TO ix_articles_title_trgm")
        op.execute("ALTER INDEX ix_articles_author_trgm_gist RENAME TO ix_articles_author_trgm")
