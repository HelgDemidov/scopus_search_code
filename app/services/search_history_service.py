import datetime
from datetime import timezone, timedelta

from app.interfaces.search_history_repo import ISearchHistoryRepository
from app.schemas.search_history_schemas import (
    QuotaResponse,
    SearchHistoryItemResponse,
    SearchHistoryResponse,
)


class SearchHistoryService:
    # Бизнес-логика чтения истории и расчета квоты. Не знает ни про httpx, ни про SQLAlchemy.
    QUOTA_LIMIT = 200    # максимум запросов за скользящее 7-дневное окно
    WINDOW_DAYS = 7

    def __init__(self, history_repo: ISearchHistoryRepository):
        self.history_repo = history_repo

    async def get_history(self, user_id: int, n: int = 100) -> SearchHistoryResponse:
        # Делегируем чтение репозиторию, конвертируем ORM → Pydantic
        rows = await self.history_repo.get_last_n(user_id, n)
        items = [SearchHistoryItemResponse.model_validate(r) for r in rows]
        return SearchHistoryResponse(items=items, total=len(items))

    async def get_quota(self, user_id: int) -> QuotaResponse:
        # Скользящее окно: считаем строки от now() - 7d до now()
        since = datetime.datetime.now(tz=timezone.utc) - timedelta(days=self.WINDOW_DAYS)
        used = await self.history_repo.count_in_window(user_id, since)
        remaining = max(0, self.QUOTA_LIMIT - used)

        # reset_at = created_at самой старой строки в окне + 7 дней:
        # как только эта строка выпадает из окна, слот освобождается
        oldest_dt = await self.history_repo.get_oldest_in_window_created_at(user_id, since)
        reset_at = (oldest_dt + timedelta(days=self.WINDOW_DAYS)) if oldest_dt else None

        return QuotaResponse(
            limit=self.QUOTA_LIMIT,
            used=used,
            remaining=remaining,
            reset_at=reset_at,
            window_days=self.WINDOW_DAYS,
        )
