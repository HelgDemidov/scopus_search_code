import datetime
from typing import List

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.search_history import SearchHistory
from app.interfaces.search_history_repo import ISearchHistoryRepository


class PostgresSearchHistoryRepository(ISearchHistoryRepository):
    def __init__(self, session: AsyncSession):
        self.session = session

    async def insert_row(
        self,
        user_id: int,
        query: str,
        result_count: int,
        filters: dict | None = None,
    ) -> SearchHistory:
        # Нормализуем None -> {} чтобы не нарушать NOT NULL ограничение
        row = SearchHistory(
            user_id=user_id,
            query=query,
            result_count=result_count,
            filters=filters or {},
        )
        self.session.add(row)
        await self.session.flush()   # заполняем id и created_at без commit — вызывающий управляет транзакцией
        await self.session.refresh(row)
        return row

    async def count_in_window(
        self,
        user_id: int,
        since: datetime.datetime,
    ) -> int:
        # SQL: SELECT COUNT(*) FROM search_history WHERE user_id=:uid AND created_at >= :since
        stmt = select(func.count(SearchHistory.id)).where(
            SearchHistory.user_id == user_id,
            SearchHistory.created_at >= since,
        )
        result = await self.session.execute(stmt)
        return result.scalar() or 0

    async def get_last_n(
        self,
        user_id: int,
        n: int = 100,
    ) -> List[SearchHistory]:
        # SQL: SELECT * FROM search_history WHERE user_id=:uid ORDER BY created_at DESC LIMIT :n
        stmt = (
            select(SearchHistory)
            .where(SearchHistory.user_id == user_id)
            .order_by(SearchHistory.created_at.desc())
            .limit(n)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_oldest_in_window_created_at(
        self,
        user_id: int,
        since: datetime.datetime,
    ) -> datetime.datetime | None:
        # Возвращает created_at самой старой строки в окне — нужно для вычисления reset_at
        stmt = (
            select(SearchHistory.created_at)
            .where(
                SearchHistory.user_id == user_id,
                SearchHistory.created_at >= since,
            )
            .order_by(SearchHistory.created_at.asc())
            .limit(1)
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()
