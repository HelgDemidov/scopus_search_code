from typing import List

from sqlalchemy import desc, func, select
from sqlalchemy.dialects.postgresql import insert
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
                "is_seeded":           a.is_seeded,  # сохраняем флаг источника
            }
            for a in articles
        ]

        stmt = (
            insert(Article)
            .values(values)
            # При конфликте по doi обновляем все мутабельные поля
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
                    "is_seeded":           insert(Article).excluded.is_seeded,  # сохраняем флаг при upsert
                },
            )
        )

        await self.session.execute(stmt)
        await self.session.commit()

    async def get_total_count(self) -> int:
        stmt = select(func.count(Article.id))
        result = await self.session.execute(stmt)
        return result.scalar() or 0

    async def get_stats(self) -> dict:
        # Все агрегаты считаются только по сидированным статьям (is_seeded=True)
        seeded = Article.is_seeded == True  # noqa: E712

        total = (await self.session.execute(
            select(func.count(Article.id)).where(seeded)
        )).scalar() or 0

        total_journals = (await self.session.execute(
            select(func.count(func.distinct(Article.journal))).where(seeded)
        )).scalar() or 0

        total_countries = (await self.session.execute(
            select(func.count(func.distinct(Article.affiliation_country))).where(seeded)
        )).scalar() or 0

        open_access_count = (await self.session.execute(
            select(func.count(Article.id)).where(seeded, Article.open_access == True)  # noqa: E712
        )).scalar() or 0

        # Распределение по годам
        by_year_rows = (await self.session.execute(
            select(
                func.extract("year", Article.publication_date).label("label"),
                func.count(Article.id).label("count"),
            )
            .where(seeded)
            .group_by("label")
            .order_by("label")
        )).all()

        # Топ-10 журналов
        by_journal_rows = (await self.session.execute(
            select(Article.journal.label("label"), func.count(Article.id).label("count"))
            .where(seeded, Article.journal.isnot(None))
            .group_by(Article.journal)
            .order_by(desc("count"))
            .limit(10)
        )).all()

        # Топ-10 стран
        by_country_rows = (await self.session.execute(
            select(Article.affiliation_country.label("label"), func.count(Article.id).label("count"))
            .where(seeded, Article.affiliation_country.isnot(None))
            .group_by(Article.affiliation_country)
            .order_by(desc("count"))
            .limit(10)
        )).all()

        # Распределение по типу документа
        by_doc_rows = (await self.session.execute(
            select(Article.document_type.label("label"), func.count(Article.id).label("count"))
            .where(seeded, Article.document_type.isnot(None))
            .group_by(Article.document_type)
            .order_by(desc("count"))
        )).all()

        # Топ ключевых слов сидера
        top_kw_rows = (await self.session.execute(
            select(Article.keyword.label("label"), func.count(Article.id).label("count"))
            .where(seeded)
            .group_by(Article.keyword)
            .order_by(desc("count"))
        )).all()

        return {
            "total_articles":   total,
            "total_journals":   total_journals,
            "total_countries":  total_countries,
            "open_access_count": open_access_count,
            "by_year":      [{"label": str(int(r.label)), "count": r.count} for r in by_year_rows],
            "by_journal":   [{"label": r.label, "count": r.count} for r in by_journal_rows],
            "by_country":   [{"label": r.label, "count": r.count} for r in by_country_rows],
            "by_doc_type":  [{"label": r.label, "count": r.count} for r in by_doc_rows],
            "top_keywords": [{"label": r.label, "count": r.count} for r in top_kw_rows],
        }
