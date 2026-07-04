"""data migration: trim search_history to last 100 rows per user

Revision ID: 0015_trim_search_history_over_limit
Revises: 0014_functional_indices_lower
Create Date: 2026-07-04

Разовый бэкфилл под retention-механизм (docs/personal-search-data/spec.md §1):
SearchService.find_and_save теперь тримит историю до HISTORY_DEPTH_LIMIT=100
на каждый новый поиск, но эта миграция закрывает случай, если у какого-то
пользователя УЖЕ накопилось больше 100 строк до включения trim-механизма.

На проде (btmiovdmasqufufyuokx, проверено 2026-07-04) максимум сейчас — 94
строки на пользователя, миграция будет no-op. Оставлена для корректности
и на случай будущего изменения HISTORY_DEPTH_LIMIT.

search_result_articles.search_history_id — ondelete="CASCADE" в модели,
удаление строк search_history здесь же автоматически подчищает их результаты.

keep_since-предохранитель (тот же, что в trim_to_last_n): не удаляем строки
младше 7 дней (QUOTA_LIMIT=200/WINDOW_DAYS=7 > HISTORY_DEPTH_LIMIT=100) —
иначе бэкфилл мог бы задним числом занизить count_in_window() для активных
пользователей и временно исказить их квоту сразу после деплоя.
"""

from alembic import op

# revision identifiers, used by Alembic.
revision = "0015_trim_search_history_over_limit"
down_revision = "0014_functional_indices_lower"
branch_labels = None
depends_on = None

_LIMIT = 100  # SearchHistoryService.HISTORY_DEPTH_LIMIT — литерал, т.к. Python-модуль недоступен из миграции
_WINDOW_DAYS = 7  # SearchHistoryService.WINDOW_DAYS — литерал по той же причине


def upgrade() -> None:
    op.execute(
        f"""
        DELETE FROM search_history WHERE id IN (
            SELECT id FROM (
                SELECT id, ROW_NUMBER() OVER (
                    PARTITION BY user_id ORDER BY created_at DESC, id DESC
                ) AS rn
                FROM search_history
            ) ranked
            WHERE rn > {_LIMIT}
        ) AND created_at < NOW() - INTERVAL '{_WINDOW_DAYS} days'
        """
    )


def downgrade() -> None:
    # Необратимо: удалённые строки истории восстановить нельзя (data migration, не schema).
    pass
