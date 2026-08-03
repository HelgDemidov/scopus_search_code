"""create seeder_run_state table

Revision ID: 0019_seeder_run_state
Revises: 0018_trgm_gin_indices
Create Date: 2026-08-03

Счётчик прогонов сидера (единственная строка, id=1) для POST /seeder/vacuum —
раз в VACUUM_EVERY_N_RUNS прогонов делает VACUUM ANALYZE articles.

Зачем: docs/backend-performance/catalog-search-latency/spec.md (deep-dive
2026-08-03) — GIN pending list (pg_trgm) на title/author растёт с каждой
действительно новой статьёй; проверено эмпирически (изолированная ветка Neon,
удалена после замера) — уже за ~2 суток при историческом темпе прироста сидера
(~3567 строк/день) чтение по каталогу деградирует ~×2, а планировщик может
вовсе бросить индекс в пользу Seq Scan (~×20) до следующего VACUUM. Штатный
autovacuum_vacuum_insert_threshold сработал бы сам не раньше ~13 дней при этом
темпе (проверено live на проде: autovacuum_vacuum_insert_scale_factor=0.2,
_threshold=1000) — недостаточно быстро. gin_pending_list_limit=4МБ (тоже
подтверждено live на проде) самоограничивает пиковый размер, но не устраняет
повторяющуюся деградацию чтения между накоплением и авточисткой.
"""

from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "0019_seeder_run_state"
down_revision: Union[str, None] = "0018_trgm_gin_indices"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "seeder_run_state",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("run_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_vacuum_at", sa.DateTime(timezone=True), nullable=True),
    )
    # Единственная строка-счётчик — id фиксирован (1), без гонки за создание
    op.execute("INSERT INTO seeder_run_state (id, run_count) VALUES (1, 0)")


def downgrade() -> None:
    op.drop_table("seeder_run_state")
