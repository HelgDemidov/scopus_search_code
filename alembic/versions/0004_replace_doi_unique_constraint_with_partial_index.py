"""replace_doi_unique_constraint_with_partial_index

Revision ID: 0004_doi_partial_index
Revises: f9a3c1e2b7d4
Create Date: 2026-04-18 21:50:00.000000

Заменяем UniqueConstraint на partial unique index по doi.

UniqueConstraint несовместим с ON CONFLICT (doi) DO UPDATE в PostgreSQL:
планировщик не может сопоставить constraint с index_elements=['doi']
в save_many() -> ProgrammingError/IntegrityError -> HTTP 500.

Partial index (WHERE doi IS NOT NULL) решает обе проблемы:
1. ON CONFLICT корректно находит индекс для арбитража конфликтов.
2. NULL-строки не конкурируют между собой — каждая статья без DOI
   вставляется независимо.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# Идентификаторы ревизии — используются Alembic для построения цепочки миграций
revision: str = '0004_doi_partial_index'
down_revision: Union[str, Sequence[str], None] = 'f9a3c1e2b7d4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Удаляем старый UniqueConstraint динамически — без хардкода имени.
    # Он был создан без name= — реальное имя зависит от версии PostgreSQL.
    # Находим его через pg_constraint по типу (уникальный) и колонке (doi)
    op.execute("""
        DO $$
        DECLARE
            cname TEXT;
        BEGIN
            SELECT conname INTO cname
            FROM pg_constraint
            WHERE conrelid = 'articles'::regclass
              AND contype = 'u'
              AND conkey = ARRAY(
                  SELECT attnum FROM pg_attribute
                  WHERE attrelid = 'articles'::regclass AND attname = 'doi'
              );
            IF cname IS NOT NULL THEN
                EXECUTE format('ALTER TABLE articles DROP CONSTRAINT %I', cname);
            END IF;
        END $$;
    """)

    # Создаем partial unique index:
    # WHERE doi IS NOT NULL — NULL-значения не индексируются,
    # поэтому ON CONFLICT (doi) DO UPDATE находит именно этот индекс
    op.create_index(
        "ix_articles_doi_unique",
        "articles",
        ["doi"],
        unique=True,
        postgresql_where=sa.text("doi IS NOT NULL"),
    )


def downgrade() -> None:
    # Удаляем partial index
    op.drop_index("ix_articles_doi_unique", table_name="articles")
    # Восстанавливаем обычный UniqueConstraint с явным именем
    op.create_unique_constraint("uq_articles_doi", "articles", ["doi"])
