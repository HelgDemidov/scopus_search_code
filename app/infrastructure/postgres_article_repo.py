from typing import List

import sqlalchemy as sa
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.interfaces.article_repository import IArticleRepository
from app.models.article import Article


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

        # Дедупликация входного списка до формирования батчей.
        # Scopus API иногда возвращает одну статью дважды в одной выдаче
        # (дубли по DOI или по title+publication_date+author).
        # ON CONFLICT DO UPDATE не может затронуть одну строку дважды
        # в рамках одной команды — это вызывает CardinalityViolationError.
        seen_doi: set[str] = set()
        seen_no_doi: set[tuple] = set()
        unique_articles: List[Article] = []

        for a in articles:
            if a.doi is not None:
                # Батч 1: уникальность по doi
                if a.doi not in seen_doi:
                    seen_doi.add(a.doi)
                    unique_articles.append(a)
            else:
                # Батч 2: уникальность по составному ключу
                key = (a.title, a.publication_date, a.author)
                if key not in seen_no_doi:
                    seen_no_doi.add(key)
                    unique_articles.append(a)

        with_doi = [a for a in unique_articles if a.doi is not None]
        without_doi = [a for a in unique_articles if a.doi is None]

        saved: List[Article] = []

        # --- Батч 1: статьи с DOI ------------------------------------------ #
        if with_doi:
            values_doi = [
                {
                    "title": a.title,
                    "journal": a.journal,
                    "author": a.author,
                    "publication_date": a.publication_date,
                    "doi": a.doi,
                    "cited_by_count": a.cited_by_count,
                    "document_type": a.document_type,
                    "open_access": a.open_access,
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
                        "title": insert(Article).excluded.title,
                        "journal": insert(Article).excluded.journal,
                        "author": insert(Article).excluded.author,
                        "publication_date": insert(Article).excluded.publication_date,
                        "cited_by_count": insert(Article).excluded.cited_by_count,
                        "document_type": insert(Article).excluded.document_type,
                        "open_access": insert(Article).excluded.open_access,
                        "affiliation_country": insert(Article).excluded.affiliation_country,
                    },
                )
            )
            await self.session.execute(stmt_doi)
            # flush видим INSERTы в текущей транзакции — без commit()
            await self.session.flush()

            # Батчевый SELECT для перечитывания id/created_at статей с DOI
            dois = [a.doi for a in with_doi]
            result = await self.session.execute(select(Article).where(Article.doi.in_(dois)))
            saved.extend(result.scalars().all())

        # --- Батч 2: статьи без DOI --------------------------------------- #
        if without_doi:
            values_no_doi = [
                {
                    "title": a.title,
                    "journal": a.journal,
                    "author": a.author,
                    "publication_date": a.publication_date,
                    "doi": None,
                    "cited_by_count": a.cited_by_count,
                    "document_type": a.document_type,
                    "open_access": a.open_access,
                    "affiliation_country": a.affiliation_country,
                }
                for a in without_doi
            ]
            stmt_no_doi = (
                insert(Article)
                .values(values_no_doi)
                .on_conflict_do_update(
                    # partial index ix_articles_no_doi_unique: (title, publication_date, author) WHERE doi IS NULL.
                    # index_elements + index_where — PostgreSQL сам находит индекс в pg_indexes;
                    # constraint= по имени искало бы в pg_constraint → UndefinedObjectError
                    index_elements=["title", "publication_date", "author"],
                    index_where=sa.text("doi IS NULL"),
                    set_={
                        "journal": insert(Article).excluded.journal,
                        "cited_by_count": insert(Article).excluded.cited_by_count,
                        "document_type": insert(Article).excluded.document_type,
                        "open_access": insert(Article).excluded.open_access,
                        "affiliation_country": insert(Article).excluded.affiliation_country,
                    },
                )
            )
            await self.session.execute(stmt_no_doi)
            await self.session.flush()

            # Батчевый SELECT: выбираем статьи по (title, publication_date, author) WHERE doi IS NULL.
            # Tuple IN-конструкция позволяет один раунд-трип вместо N запросов
            keys = [(a.title, a.publication_date, a.author) for a in without_doi]
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
        from app.models.search_history import SearchHistory
        from app.models.search_result_article import SearchResultArticle

        # Статья всегда видна, если седирована (находится в catalog_articles)
        catalog_exists = select(sa.literal(1)).where(CatalogArticle.article_id == article_id).exists()
        stmt = select(Article).where(
            Article.id == article_id,
            catalog_exists,
        )

        if user_id is not None:
            # Статья также видна, если пользователь искал её (есть в его search_result_articles)
            # select(sa.literal(1)) не привязан ни к одной таблице — без явного
            # select_from() SQLAlchemy не может определить "левую" сторону для .join()
            # и бросает InvalidRequestError ("Don't know how to join to ...") на любом
            # реальном движке (баг 2026-07-05: ни разу не был покрыт тестом с реальным SQL).
            user_search_exists = (
                select(sa.literal(1))
                .select_from(SearchResultArticle)
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

    # ------------------------------------------------------------------ #
    #  delete_orphaned                                                     #
    # ------------------------------------------------------------------ #

    async def delete_orphaned(self) -> int:
        """Garbage collection: статьи вне search_result_articles и catalog_articles.

        До PR #45 (retention-trim search_history) сирот не возникало в принципе —
        search_history/search_result_articles никогда не удалялись. Теперь
        CASCADE-удаление старых search_result_articles при trim может оставить
        статью без единой ссылки. articles.id при этом остаётся: строка нужна,
        только если она НЕ в каталоге (иначе стёрли бы реальный каталожный контент —
        catalog_articles.article_id имеет ondelete=CASCADE) И НЕ в активном поиске
        (search_result_articles.article_id — ondelete=RESTRICT, СУБД и так не даст
        удалить, но проверяем явно, а не полагаемся на исключение).
        Портируемо на SQLite — коррелированный NOT EXISTS, без PG-специфики
        (тот же принцип, что ISearchHistoryRepository.trim_to_last_n).
        """
        from app.models.catalog_article import CatalogArticle
        from app.models.search_result_article import SearchResultArticle

        referenced_by_search = select(sa.literal(1)).where(SearchResultArticle.article_id == Article.id).exists()
        referenced_by_catalog = select(sa.literal(1)).where(CatalogArticle.article_id == Article.id).exists()

        stmt = sa.delete(Article).where(~referenced_by_search, ~referenced_by_catalog)
        result = await self.session.execute(stmt)
        # CursorResult.rowcount доступен в рантайме для DML (DELETE), но Result[Any]
        # в типах execute() его не объявляет (тот же паттерн, что trim_to_last_n)
        return result.rowcount or 0  # type: ignore[attr-defined]
