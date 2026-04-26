from typing import List

import sqlalchemy as sa
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.article import Article
from app.interfaces.article_repository import IArticleRepository


class PostgresArticleRepository(IArticleRepository):
    def __init__(self, session: AsyncSession):
        self.session = session

    # ------------------------------------------------------------------ #
    #  upsert_many                                                         #
    # ------------------------------------------------------------------ #

    async def upsert_many(self, articles: List[Article]) -> List[Article]:
        """Bulk-upsert статей, возвращает записи с заполненным id из БД.

        Два батча INSERT:
          1) Статьи с DOI   — ON CONFLICT (doi) WHERE doi IS NOT NULL DO UPDATE
          2) Статьи без DOI — ON CONFLICT (title, publication_date, author)
             WHERE doi IS NULL DO UPDATE (использует ix_articles_no_doi_unique)

        Затем два батча SELECT для перечитывания записей с серверными id/created_at.
        Использует flush() — commit() остается за вызывающим кодом.

        keyword и is_seeded намеренно исключены из values и set_:
        ON CONFLICT DO UPDATE не трогает эти поля в существующих строках.
        Seeded-статьи сохраняют is_seeded=True и keyword до удаления колонок
        в миграции 0007 (Фаза 3).
        """
        if not articles:
            return []

        with_doi    = [a for a in articles if a.doi is not None]
        without_doi = [a for a in articles if a.doi is None]

        saved: List[Article] = []

        # --- Батч 1: статьи с DOI ------------------------------------------ #
        if with_doi:
            values_doi = [
                {
                    "title":               a.title,
                    "journal":             a.journal,
                    "author":              a.author,
                    "publication_date":    a.publication_date,
                    "doi":                 a.doi,
                    "cited_by_count":      a.cited_by_count,
                    "document_type":       a.document_type,
                    "open_access":         a.open_access,
                    "affiliation_country": a.affiliation_country,
                }
                for a in with_doi
            ]
            stmt_doi = (
                insert(Article)
                .values(values_doi)
                .on_conflict_do_update(
                    # partial index ix_articles_doi_unique: doi IS NOT NULL
                    index_elements=["doi"],
                    index_where=sa.text("doi IS NOT NULL"),
                    set_={
                        "title":               insert(Article).excluded.title,
                        "journal":             insert(Article).excluded.journal,
                        "author":              insert(Article).excluded.author,
                        "publication_date":    insert(Article).excluded.publication_date,
                        "cited_by_count":      insert(Article).excluded.cited_by_count,
                        "document_type":       insert(Article).excluded.document_type,
                        "open_access":         insert(Article).excluded.open_access,
                        "affiliation_country": insert(Article).excluded.affiliation_country,
                    },
                )
            )
            await self.session.execute(stmt_doi)
            # flush видим INSERTы в текущей транзакции — без commit()
            await self.session.flush()

            # Батчевый SELECT для перечитывания id/created_at статей с DOI
            dois = [a.doi for a in with_doi]
            result = await self.session.execute(
                select(Article).where(Article.doi.in_(dois))
            )
            saved.extend(result.scalars().all())

        # --- Батч 2: статьи без DOI --------------------------------------- #
        if without_doi:
            values_no_doi = [
                {
                    "title":               a.title,
                    "journal":             a.journal,
                    "author":              a.author,
                    "publication_date":    a.publication_date,
                    "doi":                 None,
                    "cited_by_count":      a.cited_by_count,
                    "document_type":       a.document_type,
                    "open_access":         a.open_access,
                    "affiliation_country": a.affiliation_country,
                }
                for a in without_doi
            ]
            stmt_no_doi = (
                insert(Article)
                .values(values_no_doi)
                .on_conflict_do_update(
                    # partial index ix_articles_no_doi_unique: (title, publication_date, author) WHERE doi IS NULL
                    constraint="ix_articles_no_doi_unique",
                    set_={
                        "journal":             insert(Article).excluded.journal,
                        "cited_by_count":      insert(Article).excluded.cited_by_count,
                        "document_type":       insert(Article).excluded.document_type,
                        "open_access":         insert(Article).excluded.open_access,
                        "affiliation_country": insert(Article).excluded.affiliation_country,
                    },
                )
            )
            await self.session.execute(stmt_no_doi)
            await self.session.flush()

            # Батчевый SELECT: выбираем статьи по (title, publication_date, author) WHERE doi IS NULL.
            # Tuple IN-конструкция позволяет один раунд-трип вместо N запросов
            keys = [
                (a.title, a.publication_date, a.author)
                for a in without_doi
            ]
            result = await self.session.execute(
                select(Article).where(
                    Article.doi.is_(None),
                    sa.tuple_(
                        Article.title,
                        Article.publication_date,
                        Article.author,
                    ).in_(keys),
                )
            )
            saved.extend(result.scalars().all())

        return saved

    # ------------------------------------------------------------------ #
    #  get_by_id                                                           #
    # ------------------------------------------------------------------ #

    async def get_by_id(
        self,
        article_id: int,
        user_id: int | None = None,
    ) -> Article | None:
        """GET /articles/{article_id} — публичный доступ по id.

        Доступ по правилам видимости (ТЗ раздел 3):
          - статья видна, если она есть в catalog_articles (is_seeded)
          - статья видна, если user_id указан и она есть в его search_result_articles
          - если user_id=None — проверяем только catalog_articles
        """
        from app.models.catalog_article import CatalogArticle
        from app.models.search_result_article import SearchResultArticle
        from app.models.search_history import SearchHistory

        # Статья всегда видна, если седирована (находится в catalog_articles)
        catalog_exists = (
            select(sa.literal(1))
            .where(CatalogArticle.article_id == article_id)
            .exists()
        )
        stmt = select(Article).where(
            Article.id == article_id,
            catalog_exists,
        )

        if user_id is not None:
            # Статья также видна, если пользователь искал её (есть в его search_result_articles)
            user_search_exists = (
                select(sa.literal(1))
                .join(
                    SearchHistory,
                    SearchResultArticle.search_history_id == SearchHistory.id,
                )
                .where(
                    SearchResultArticle.article_id == article_id,
                    SearchHistory.user_id == user_id,
                )
                .exists()
            )
            stmt = select(Article).where(
                Article.id == article_id,
                sa.or_(catalog_exists, user_search_exists),
            )

        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()
