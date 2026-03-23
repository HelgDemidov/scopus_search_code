from typing import List

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.article import Article
from app.services.interfaces.article_repository import IArticleRepository


class PostgresArticleRepository(IArticleRepository):
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_all(self, limit: int, offset: int) -> List[Article]:
        # SQL: SELECT * FROM articles LIMIT {limit} OFFSET {offset};
        stmt = select(Article).limit(limit).offset(offset)
        result = await self.session.execute(stmt)
        # Возвращаем список объектов
        return list(result.scalars().all())

    async def save_many(self, articles: List[Article]) -> None:
        self.session.add_all(articles)
        await self.session.commit()

    async def get_total_count(self) -> int:
        stmt = select(func.count(Article.id))
        result = await self.session.execute(stmt)
        return result.scalar() or 0

