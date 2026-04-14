from typing import List

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert  # <-- Правильный импорт для PostgreSQL
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.article import Article
from app.interfaces.article_repository import IArticleRepository


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
        if not articles:
            return

        # Формируем значения для bulk insert — только поля, доступные в Scopus free-tier
        values = [
            {
                "title":               a.title,
                "journal":             a.journal,
                "author":              a.author,
                "publication_date":    a.publication_date,
                "doi":                 a.doi,
                "keyword":             a.keyword,
                "cited_by_count":      a.cited_by_count,
                "document_type":       a.document_type,
                "open_access":         a.open_access,
                "affiliation_country": a.affiliation_country,
            }
            for a in articles
        ]

        stmt = (
            insert(Article)
            .values(values)
            # При конфликте по doi обновляем все мутабельные поля,
            # чтобы повторные прогоны сидера исправляли неполные данные
            .on_conflict_do_update(
                index_elements=["doi"],
                set_={
                    "title":               insert(Article).excluded.title,
                    "journal":             insert(Article).excluded.journal,
                    "author":              insert(Article).excluded.author,
                    "publication_date":    insert(Article).excluded.publication_date,
                    "keyword":             insert(Article).excluded.keyword,
                    "cited_by_count":      insert(Article).excluded.cited_by_count,
                    "document_type":       insert(Article).excluded.document_type,
                    "open_access":         insert(Article).excluded.open_access,
                    "affiliation_country": insert(Article).excluded.affiliation_country,
                },
            )
        )

        await self.session.execute(stmt)
        await self.session.commit()

    async def get_total_count(self) -> int:
        stmt = select(func.count(Article.id))
        result = await self.session.execute(stmt)
        return result.scalar() or 0
