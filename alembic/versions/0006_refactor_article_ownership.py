"""refactor article ownership — Phase 1: create new tables and indexes

Revision ID: 0006_refactor_article_ownership
Revises: 0005_add_search_history
Create Date: 2026-04-22 02:39:00.000000

Фаза 1 — не разрушающая. Приложение после этой миграции продолжает работать
в текущем состоянии. Колонки keyword и is_seeded в articles не трогаются
физически — это Фаза 3 (миграция 0007).

Что создаётся / изменяется:
- ALTER TABLE articles ALTER COLUMN keyword DROP NOT NULL — делаем keyword
  nullable, чтобы scopus_client мог создавать Article без keyword.
  Физическое удаление колонки — Фаза 3 (миграция 0007).
- ix_articles_no_doi_unique: partial UNIQUE INDEX для корректного upsert
  статей без DOI (articles WHERE doi IS NULL)
- catalog_articles: коллекция сидера (принадлежность статьи — отдельная
  сущность, а не флаг is_seeded)
- search_result_articles: связь search_history <-> articles с полем rank

Что НЕ делает эта миграция:
- Не переносит данные в catalog_articles (Фаза 2 — ручной шаг М-2)
- Не удаляет колонки keyword / is_seeded (Фаза 3 — миграция 0007)
- ix_sra_article_id намеренно не создаётся: ни один эндпоинт не ищет
  по article_id без search_history_id (замечание S-3 из ТЗ v2.1)
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic
revision: str = '0006_refactor_article_ownership'
down_revision: Union[str, Sequence[str], None] = '0005_add_search_history'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- Операция 0: делаем keyword nullable ---
    # Необходимо до Шага 3: scopus_client больше не передает keyword в Article,
    # поэтому flush() при upsert_many упал бы с NOT NULL violation без этой правки.
    # Физическое удаление колонки — в миграции 0007 (Фаза 3).
    op.alter_column('articles', 'keyword', nullable=True)

    # --- Операция 1: partial UNIQUE INDEX для статей без DOI ---
    # Необходим для второго батчевого INSERT в upsert_many (замечание A-1)
    # Создаётся первым — до дочерних таблиц, ссылающихся на articles
    op.execute(
        """
        CREATE UNIQUE INDEX ix_articles_no_doi_unique
            ON articles(title, publication_date, author)
            WHERE doi IS NULL
        """
    )

    # --- Операция 2: таблица catalog_articles ---
    # Хранит принадлежность статьи публичной коллекции сидера.
    # UNIQUE (article_id) гарантирует, что статья входит в коллекцию не более одного раза
    op.create_table(
        'catalog_articles',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('article_id', sa.Integer(), nullable=False),
        sa.Column('keyword', sa.String(length=100), nullable=False),
        sa.Column(
            'seeded_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()'),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ['article_id'],
            ['articles.id'],
            ondelete='CASCADE',
        ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('article_id', name='uq_catalog_articles_article_id'),
    )

    # Индекс по article_id — поиск статьи в коллекции по её id
    op.create_index(
        'ix_catalog_articles_article_id',
        'catalog_articles',
        ['article_id'],
    )

    # Индекс по keyword — фильтрация коллекции по теме поиска сидера
    op.create_index(
        'ix_catalog_articles_keyword',
        'catalog_articles',
        ['keyword'],
    )

    # --- Операция 3: таблица search_result_articles ---
    # Связь search_history <-> articles с сохранением порядка (rank).
    # ON DELETE CASCADE по search_history_id: удаление истории удаляет результаты.
    # ON DELETE RESTRICT по article_id: статью нельзя удалить, пока она в чьём-то поиске
    op.create_table(
        'search_result_articles',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('search_history_id', sa.Integer(), nullable=False),
        sa.Column('article_id', sa.Integer(), nullable=False),
        sa.Column('rank', sa.SmallInteger(), nullable=False),
        sa.ForeignKeyConstraint(
            ['search_history_id'],
            ['search_history.id'],
            ondelete='CASCADE',
        ),
        sa.ForeignKeyConstraint(
            ['article_id'],
            ['articles.id'],
            ondelete='RESTRICT',
        ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint(
            'search_history_id',
            'article_id',
            name='uq_sra_history_article',
        ),
    )

    # Единственный индекс — главный путь чтения: все статьи одного поиска
    # ix_sra_article_id намеренно не создаётся (замечание S-3)
    op.create_index(
        'ix_sra_search_history_id',
        'search_result_articles',
        ['search_history_id'],
    )


def downgrade() -> None:
    # Порядок важен: сначала дочерние таблицы, потом индекс на родительской

    # Удаляем search_result_articles и её индекс
    op.drop_index('ix_sra_search_history_id', table_name='search_result_articles')
    op.drop_table('search_result_articles')

    # Удаляем catalog_articles и её индексы
    op.drop_index('ix_catalog_articles_keyword', table_name='catalog_articles')
    op.drop_index('ix_catalog_articles_article_id', table_name='catalog_articles')
    op.drop_table('catalog_articles')

    # Удаляем partial UNIQUE INDEX на articles
    op.execute('DROP INDEX IF EXISTS ix_articles_no_doi_unique')

    # Восстанавливаем NOT NULL на keyword (откат Операции 0)
    op.alter_column('articles', 'keyword', nullable=False)
