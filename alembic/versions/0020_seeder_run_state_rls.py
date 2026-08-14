"""enable RLS on seeder_run_state

Revision ID: 0020_seeder_run_state_rls
Revises: 0019_seeder_run_state
Create Date: 2026-08-14

Supabase-адвайзер (get_advisors, 2026-08-14) отметил public.seeder_run_state
как единственную публичную таблицу без RLS — таблица создана миграцией 0019
напрямую через Alembic/SQLAlchemy, а не через дашборд Supabase, где RLS
включается по умолчанию для новых таблиц. Проверено live: у всех остальных
public-таблиц (articles, catalog_articles, users и т.д.) RLS включён, но
ни одной pg_policies-записи в schema public нет вообще — значит, "включить
RLS без политик" уже и есть действующий паттерн проекта (deny-all для любой
роли кроме владельца таблицы/суперюзера). Приложение подключается к Postgres
напрямую через DATABASE_URL/SQLAlchemy (роль-владелец), а не через
Supabase PostgREST anon/authenticated — включение RLS не влияет на доступ
бэкенда, что уже подтверждено тем, что приложение работает с остальными
RLS-enabled таблицами без единой политики.
"""

from typing import Union

from alembic import op

revision: str = "0020_seeder_run_state_rls"
down_revision: Union[str, None] = "0019_seeder_run_state"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE seeder_run_state ENABLE ROW LEVEL SECURITY")


def downgrade() -> None:
    op.execute("ALTER TABLE seeder_run_state DISABLE ROW LEVEL SECURITY")
