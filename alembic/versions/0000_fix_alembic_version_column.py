"""fix_alembic_version_column

Revision ID: 0000_fix_alembic_version_column
Revises:
Create Date: 2026-04-23 22:44:00.000000

Проблема: Alembic по умолчанию создаёт alembic_version.version_num как VARCHAR(32).
Некоторые БД-провайдеры (Supabase/PgBouncer) не расширяют её автоматически,
что приводит к ошибке 'value too long for type character varying(32)'
при попытке записать revision ID длиннее 32 символов (например, '0005b_rename_date_add_scopus_fields').

Решение: принудительно расширить колонку до VARCHAR(64) как первый шаг цепочки миграций.
Все revision ID проекта укладываются в 64 символа с запасом.
"""
from typing import Sequence, Union

from alembic import op

# идентификаторы ревизии
revision: str = '0000_fix_alembic_version_column'
down_revision: Union[str, Sequence[str], None] = None  # первая в цепочке
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Расширяем version_num с VARCHAR(32) до VARCHAR(64)."""
    # Идемпотентная операция: если колонка уже VARCHAR(64) или шире — не упадёт,
    # Postgres просто применит ALTER без ошибки (расширение типа не требует rewrite)
    op.execute(
        "ALTER TABLE alembic_version "
        "ALTER COLUMN version_num TYPE VARCHAR(64)"
    )


def downgrade() -> None:
    """Возвращаем version_num к стандартному VARCHAR(32)."""
    # ВНИМАНИЕ: downgrade возможен только если текущий revision_id укладывается в 32 символа
    op.execute(
        "ALTER TABLE alembic_version "
        "ALTER COLUMN version_num TYPE VARCHAR(32)"
    )
