from typing import List

import sqlalchemy as sa
from sqlalchemy import desc, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.article import Article
from app.interfaces.article_repository import IArticleRepository


class PostgresArticleRepository(IArticleRepository):
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_all(
        self,
        limit: int,
        offset: int,
        keyword: str | None = None,
        search: str | None = None,
    ) -> List[Article]:
        # SQL: SELECT * FROM articles [WHERE ...] ORDER BY publication_date DESC LIMIT {limit} OFFSET {offset}
        # keyword — точное совпадение с фразой сидера (поле keyword)
        # search  — fulltext ILIKE по title и author для пользовательского поиска
        stmt = select(Article)
        if keyword is not None:
            stmt = stmt.where(Article.keyword == keyword)
        if search is not None:
            pattern = f"%{search}%"
            stmt = stmt.where(
                sa.or_(
                    Article.title.ilike(pattern),
                    Article.author.ilike(pattern),
                )
            )
        # ORDER BY гарантирует детерминированный порядок при пагинации
        stmt = stmt.order_by(desc(Article.publication_date)).limit(limit).offset(offset)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_by_id(self, article_id: int) -> Article | None:
        # SQL: SELECT * FROM articles WHERE id = :article_id LIMIT 1
        stmt = select(Article).where(Article.id == article_id)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def save_many(self, articles: List[Article]) -> List[Article]:
        if not articles:
            return []

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
                index_where=sa.text("doi IS NOT NULL"),  # соответствует partial index в БД
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

        # INSERT ON CONFLICT (Core-запрос) не обновляет Python-объекты автоматически —
        # id и created_at остаются None до явного перечитывания из БД
        dois = [a.doi for a in articles if a.doi is not None]
        saved: List[Article] = []

        if dois:
            # Статьи с DOI выбираем одним запросом через IN
            result = await self.session.execute(
                select(Article).where(Article.doi.in_(dois))
            )
            saved.extend(result.scalars().all())

        # Статьи без DOI не покрыты partial index — вставляются всегда,
        # выбираем по title+keyword как наиболее точному доступному идентификатору
        no_doi_articles = [a for a in articles if a.doi is None]
        for a in no_doi_articles:
            result = await self.session.execute(
                select(Article)
                .where(
                    Article.title == a.title,
                    Article.keyword == a.keyword,
                )
                .order_by(Article.id.desc())
                .limit(1)
            )
            found = result.scalar_one_or_none()
            if found:
                saved.append(found)

        return saved

    async def get_total_count(
        self,
        keyword: str | None = None,
        search: str | None = None,
    ) -> int:
        # Считает статьи с учётом тех же фильтров, что get_all — для корректной пагинации
        stmt = select(func.count(Article.id))
        if keyword is not None:
            stmt = stmt.where(Article.keyword == keyword)
        if search is not None:
            pattern = f"%{search}%"
            stmt = stmt.where(
                sa.or_(
                    Article.title.ilike(pattern),
                    Article.author.ilike(pattern),
                )
            )
        result = await self.session.execute(stmt)
        return result.scalar() or 0

    async def get_search_stats(self, search: str) -> dict:
        # Один CTE-запрос — все пять агрегатов за один round-trip к PostgreSQL
        # filtered CTE применяет ILIKE однократно; все sub-агрегаты читают его
        # json_agg упаковывает результаты в JSON на стороне БД — Python получает готовые списки
        # COALESCE защищает от NULL: json_agg на пустом наборе возвращает NULL, не []
        sql = sa.text("""
            WITH filtered AS (
                SELECT publication_date, journal, affiliation_country, document_type
                FROM articles
                WHERE title ILIKE :pattern OR author ILIKE :pattern
            ),
            total_cte AS (
                SELECT COUNT(*) AS total FROM filtered
            ),
            by_year_cte AS (
                SELECT json_agg(
                    json_build_object('label', yr, 'count', cnt) ORDER BY yr
                ) AS data
                FROM (
                    SELECT EXTRACT(YEAR FROM publication_date)::int AS yr,
                           COUNT(*) AS cnt
                    FROM filtered
                    GROUP BY yr
                ) t
            ),
            by_journal_cte AS (
                SELECT json_agg(
                    json_build_object('label', journal, 'count', cnt) ORDER BY cnt DESC
                ) AS data
                FROM (
                    SELECT journal, COUNT(*) AS cnt
                    FROM filtered
                    WHERE journal IS NOT NULL
                    GROUP BY journal
                    ORDER BY cnt DESC
                    LIMIT 10
                ) t
            ),
            by_country_cte AS (
                SELECT json_agg(
                    json_build_object('label', affiliation_country, 'count', cnt) ORDER BY cnt DESC
                ) AS data
                FROM (
                    SELECT affiliation_country, COUNT(*) AS cnt
                    FROM filtered
                    WHERE affiliation_country IS NOT NULL
                    GROUP BY affiliation_country
                    ORDER BY cnt DESC
                    LIMIT 10
                ) t
            ),
            by_doc_cte AS (
                SELECT json_agg(
                    json_build_object('label', document_type, 'count', cnt) ORDER BY cnt DESC
                ) AS data
                FROM (
                    SELECT document_type, COUNT(*) AS cnt
                    FROM filtered
                    WHERE document_type IS NOT NULL
                    GROUP BY document_type
                    ORDER BY cnt DESC
                ) t
            )
            SELECT
                (SELECT total FROM total_cte)::int                          AS total,
                COALESCE((SELECT data FROM by_year_cte),    '[]'::json)    AS by_year,
                COALESCE((SELECT data FROM by_journal_cte), '[]'::json)    AS by_journal,
                COALESCE((SELECT data FROM by_country_cte), '[]'::json)    AS by_country,
                COALESCE((SELECT data FROM by_doc_cte),     '[]'::json)    AS by_doc_type
        """)

        row = (
            await self.session.execute(sql, {"pattern": f"%{search}%"})
        ).mappings().one()

        # asyncpg отдаёт json-поля как list[dict], psycopg2 — как строку JSON
        def _parse(val):
            if isinstance(val, str):
                import json
                return json.loads(val)
            return val or []

        return {
            "total":       row["total"],
            "by_year":     _parse(row["by_year"]),
            "by_journal":  _parse(row["by_journal"]),
            "by_country":  _parse(row["by_country"]),
            "by_doc_type": _parse(row["by_doc_type"]),
        }

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
