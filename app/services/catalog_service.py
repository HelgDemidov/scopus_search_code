# Сервис каталога сидера — управляет статьями, добавленными автоматическим сидером
from typing import List

from sqlalchemy.ext.asyncio import AsyncSession

from app.interfaces.article_repository import IArticleRepository
from app.interfaces.catalog_repository import ICatalogRepository
from app.models.article import Article
from app.schemas.article_schemas import ArticleResponse, CountByField, PaginatedArticleResponse, StatsResponse


class CatalogService:
    def __init__(
        self,
        article_repo: IArticleRepository,
        catalog_repo: ICatalogRepository,
        session: AsyncSession,
    ):
        self.article_repo = article_repo
        self.catalog_repo = catalog_repo
        self.session = session

    # ------------------------------------------------------------------ #
    #  get_catalog_paginated                                               #
    # ------------------------------------------------------------------ #

    async def get_catalog_paginated(
        self,
        page: int,
        size: int,
        keyword: str | None = None,
        search: str | None = None,
    ) -> PaginatedArticleResponse:
        """Пагинированный список статей каталога с опциональными фильтрами.

        keyword: точное совпадение по ключевому слову сидера.
        search:  ILIKE-поиск по title/author.
        """
        # Защита от некорректных значений пагинации
        if page < 1:
            page = 1
        if size < 1:
            size = 10

        limit = size
        offset = (page - 1) * size

        # Два параллельных запроса: данные + COUNT (одинаковые WHERE-условия)
        db_articles = await self.catalog_repo.get_all(
            limit=limit, offset=offset, keyword=keyword, search=search
        )
        total = await self.catalog_repo.get_total_count(keyword=keyword, search=search)

        # ORM-объекты → Pydantic-схемы
        article_responses = [
            ArticleResponse.model_validate(article)
            for article in db_articles
        ]
        return PaginatedArticleResponse(articles=article_responses, total=total)

    # ------------------------------------------------------------------ #
    #  get_stats                                                           #
    # ------------------------------------------------------------------ #

    async def get_stats(self) -> StatsResponse:
        """Агрегированная статистика по каталогу сидера."""
        raw = await self.catalog_repo.get_stats()

        # Конвертируем сырые dict-списки в типизированные Pydantic-схемы
        return StatsResponse(
            total_articles=raw["total_articles"],
            total_journals=raw["total_journals"],
            total_countries=raw["total_countries"],
            open_access_count=raw["open_access_count"],
            by_year=[
                CountByField(label=str(r["year"]), count=r["count"])
                for r in raw["by_year"]
            ],
            by_journal=[
                CountByField(label=r["journal"], count=r["count"])
                for r in raw["by_journal"]
            ],
            by_country=[
                CountByField(label=r["country"], count=r["count"])
                for r in raw["by_country"]
            ],
            by_doc_type=[
                CountByField(label=r["doc_type"], count=r["count"])
                for r in raw["by_doc_type"]
            ],
            top_keywords=[
                CountByField(label=r["keyword"], count=r["count"])
                for r in raw["top_keywords"]
            ],
        )

    # ------------------------------------------------------------------ #
    #  seed                                                                #
    # ------------------------------------------------------------------ #

    async def seed(
        self,
        articles: List[Article],
        keyword: str,
    ) -> List[Article]:
        """Сохраняет статьи сидера: upsert в articles → запись в catalog_articles.

        Единственный метод, который вызывает commit().
        Атомарность: либо обе таблицы обновлены, либо ни одна.
        Вызывающий код (сидер) не должен делать commit().
        """
        # Шаг 1: upsert в таблицу articles — получаем статьи с id из БД
        articles_with_ids = await self.article_repo.upsert_many(articles)

        # Шаг 2: запись в catalog_articles (ON CONFLICT DO NOTHING)
        await self.catalog_repo.save_seeded(articles_with_ids, keyword)

        # Шаг 3: фиксируем транзакцию — обе операции атомарны
        await self.session.commit()

        return articles_with_ids
