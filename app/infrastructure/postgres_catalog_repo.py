from typing import List

import sqlalchemy as sa
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.interfaces.catalog_repository import ICatalogRepository
from app.models.article import Article
from app.models.catalog_article import CatalogArticle
from app.utils.db_utils import escape_ilike


class PostgresCatalogRepository(ICatalogRepository):
    def __init__(self, session: AsyncSession):
        self.session = session

    # ------------------------------------------------------------------ #
    #  get_all                                                             #
    # ------------------------------------------------------------------ #

    async def get_all(
        self,
        limit: int,
        offset: int,
        keyword: str | None = None,
        search: str | None = None,
    ) -> List[Article]:
        """Статьи каталога с пагинацией и опциональными фильтрами.

        keyword: точное совпадение catalog_articles.keyword (ключевое слово сидера).
        search:  ILIKE-поиск по title и author через escape_ilike().
        """
        # Базовый запрос: JOIN catalog_articles → articles через article_id
        stmt = (
            select(Article)
            .join(CatalogArticle, CatalogArticle.article_id == Article.id)
        )

        # Фильтр по ключевому слову сидера (точное совпадение)
        if keyword is not None:
            stmt = stmt.where(CatalogArticle.keyword == keyword)

        # ILIKE-фильтр по заголовку или автору (экранируем спецсимволы)
        if search is not None:
            pattern = f"%{escape_ilike(search)}%"
            stmt = stmt.where(
                sa.or_(
                    Article.title.ilike(pattern),
                    Article.author.ilike(pattern),
                )
            )

        # Сортировка по дате публикации: свежие статьи первыми
        stmt = stmt.order_by(Article.publication_date.desc()).limit(limit).offset(offset)

        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    # ------------------------------------------------------------------ #
    #  get_total_count                                                     #
    # ------------------------------------------------------------------ #

    async def get_total_count(
        self,
        keyword: str | None = None,
        search: str | None = None,
    ) -> int:
        """COUNT с теми же фильтрами что get_all — для корректной пагинации."""
        # Субзапрос для COUNT: те же JOIN + WHERE, без ORDER BY / LIMIT
        stmt = (
            select(func.count())
            .select_from(Article)
            .join(CatalogArticle, CatalogArticle.article_id == Article.id)
        )

        if keyword is not None:
            stmt = stmt.where(CatalogArticle.keyword == keyword)

        if search is not None:
            pattern = f"%{escape_ilike(search)}%"
            stmt = stmt.where(
                sa.or_(
                    Article.title.ilike(pattern),
                    Article.author.ilike(pattern),
                )
            )

        result = await self.session.execute(stmt)
        return result.scalar_one()

    # ------------------------------------------------------------------ #
    #  save_seeded                                                         #
    # ------------------------------------------------------------------ #

    async def save_seeded(
        self,
        articles: List[Article],
        keyword: str,
    ) -> List[Article]:
        """Записывает статьи сидера в catalog_articles.

        Предполагает, что articles уже сохранены в таблице articles
        (т.е. имеют заполненный id после upsert_many в article_repo).
        ON CONFLICT DO NOTHING: повторный вызов с теми же статьями идемпотентен.
        Только flush() — commit() остаётся за CatalogService.
        """
        if not articles:
            return articles

        # Батчевый INSERT в catalog_articles
        values = [
            {
                "article_id": a.id,
                "keyword":    keyword,
            }
            for a in articles
        ]
        stmt = (
            insert(CatalogArticle)
            .values(values)
            # uq_catalog_articles_article_id: каждая статья в каталоге не более одного раза
            .on_conflict_do_nothing(constraint="uq_catalog_articles_article_id")
        )
        await self.session.execute(stmt)
        await self.session.flush()

        return articles

    # ------------------------------------------------------------------ #
    #  get_stats                                                           #
    # ------------------------------------------------------------------ #

    async def get_stats(self) -> dict:
        """Агрегированная статистика по каталогу сидера.

        Один round-trip: CTE + несколько подзапросов-агрегатов.
        Агрегирует только статьи из catalog_articles (не весь реестр articles).
        """
        # CTE: только id статей, которые входят в каталог
        catalog_ids_cte = (
            select(CatalogArticle.article_id)
            .distinct()
            .cte("catalog_ids")
        )

        # Базовый подзапрос каталожных статей — переиспользуем в агрегатах
        catalog_articles_q = (
            select(Article)
            .where(Article.id.in_(select(catalog_ids_cte.c.article_id)))
            .subquery()
        )

        # Итоговые счётчики
        totals = await self.session.execute(
            select(
                func.count().label("total_articles"),
                func.count(
                    catalog_articles_q.c.journal.distinct()
                ).label("total_journals"),
                func.count(
                    catalog_articles_q.c.affiliation_country.distinct()
                ).label("total_countries"),
                func.sum(
                    sa.cast(
                        sa.case((catalog_articles_q.c.open_access.is_(True), 1), else_=0),
                        sa.Integer,
                    )
                ).label("open_access_count"),
            ).select_from(catalog_articles_q)
        )
        row = totals.one()

        # Распределение по годам
        by_year_rows = await self.session.execute(
            select(
                func.extract("year", catalog_articles_q.c.publication_date).label("year"),
                func.count().label("count"),
            )
            .select_from(catalog_articles_q)
            .group_by(sa.text("year"))
            .order_by(sa.text("year DESC"))
        )

        # Распределение по журналам (топ-20)
        by_journal_rows = await self.session.execute(
            select(
                catalog_articles_q.c.journal,
                func.count().label("count"),
            )
            .select_from(catalog_articles_q)
            .where(catalog_articles_q.c.journal.isnot(None))
            .group_by(catalog_articles_q.c.journal)
            .order_by(sa.text("count DESC"))
            .limit(20)
        )

        # Распределение по странам
        by_country_rows = await self.session.execute(
            select(
                catalog_articles_q.c.affiliation_country,
                func.count().label("count"),
            )
            .select_from(catalog_articles_q)
            .where(catalog_articles_q.c.affiliation_country.isnot(None))
            .group_by(catalog_articles_q.c.affiliation_country)
            .order_by(sa.text("count DESC"))
            .limit(20)
        )

        # Распределение по типам документов
        by_doc_type_rows = await self.session.execute(
            select(
                catalog_articles_q.c.document_type,
                func.count().label("count"),
            )
            .select_from(catalog_articles_q)
            .where(catalog_articles_q.c.document_type.isnot(None))
            .group_by(catalog_articles_q.c.document_type)
            .order_by(sa.text("count DESC"))
        )

        # Топ ключевых слов из catalog_articles.keyword
        top_keywords_rows = await self.session.execute(
            select(
                CatalogArticle.keyword,
                func.count().label("count"),
            )
            .group_by(CatalogArticle.keyword)
            .order_by(sa.text("count DESC"))
            .limit(20)
        )

        return {
            "total_articles":  row.total_articles,
            "total_journals":  row.total_journals,
            "total_countries": row.total_countries,
            "open_access_count": row.open_access_count or 0,
            "by_year":       [{"year": int(r.year), "count": r.count} for r in by_year_rows],
            "by_journal":    [{"journal": r.journal, "count": r.count} for r in by_journal_rows],
            "by_country":    [{"country": r.affiliation_country, "count": r.count} for r in by_country_rows],
            "by_doc_type":   [{"doc_type": r.document_type, "count": r.count} for r in by_doc_type_rows],
            "top_keywords":  [{"keyword": r.keyword, "count": r.count} for r in top_keywords_rows],
        }
