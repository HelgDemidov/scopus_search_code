# Сервис каталога сидера — управляет статьями, добавленными автоматическим сидером
from __future__ import annotations

import logging
from typing import TYPE_CHECKING, List

from sqlalchemy.ext.asyncio import AsyncSession

from app.interfaces.article_repository import IArticleRepository
from app.interfaces.catalog_repository import ICatalogRepository
from app.models.article import Article
from app.schemas.article_schemas import ArticleResponse, CountByField, PaginatedArticleResponse, StatsResponse

if TYPE_CHECKING:
    from app.infrastructure.redis_client import UpstashRedisClient

from app.infrastructure.redis_client import STATS_CACHE_TTL, make_stats_cache_key

logger = logging.getLogger(__name__)


class CatalogService:
    def __init__(
        self,
        article_repo: IArticleRepository,
        catalog_repo: ICatalogRepository,
        session: AsyncSession,
        redis: UpstashRedisClient | None = None,
    ):
        self.article_repo = article_repo
        self.catalog_repo = catalog_repo
        self.session = session
        self.redis = redis

    # ------------------------------------------------------------------ #
    #  get_catalog_paginated                                               #
    # ------------------------------------------------------------------ #

    async def get_catalog_paginated(
        self,
        page: int,
        size: int,
        keyword: str | None = None,
        search: str | None = None,
        year_from: int | None = None,
        year_to: int | None = None,
        doc_types: list[str] | None = None,
        open_access: bool | None = None,
        countries: list[str] | None = None,
    ) -> PaginatedArticleResponse:
        """Пагинированный список статей каталога с опциональными фильтрами.

        keyword:     точное совпадение по ключевому слову сидера.
        search:      ILIKE-поиск по title/author.
        year_from:   год публикации >= year_from.
        year_to:     год публикации <= year_to.
        doc_types:   фильтр по типам документов (список).
        open_access: True — только OA; False — только не-OA; None — все.
        countries:   фильтр по странам аффилиации (список).
        """
        # Защита от некорректных значений пагинации
        if page < 1:
            page = 1
        if size < 1:
            size = 10

        limit = size
        offset = (page - 1) * size

        # Два запроса с идентичными фильтрами: данные + COUNT для пагинации
        db_articles = await self.catalog_repo.get_all(
            limit=limit,
            offset=offset,
            keyword=keyword,
            search=search,
            year_from=year_from,
            year_to=year_to,
            doc_types=doc_types,
            open_access=open_access,
            countries=countries,
        )
        total = await self.catalog_repo.get_total_count(
            keyword=keyword,
            search=search,
            year_from=year_from,
            year_to=year_to,
            doc_types=doc_types,
            open_access=open_access,
            countries=countries,
        )

        # ORM-объекты → Pydantic-схемы
        article_responses = [ArticleResponse.model_validate(article) for article in db_articles]
        return PaginatedArticleResponse(items=article_responses, total=total)

    # ------------------------------------------------------------------ #
    #  get_stats                                                           #
    # ------------------------------------------------------------------ #

    async def get_stats(
        self,
        countries: list[str] | None = None,
        doc_types: list[str] | None = None,
        open_access: bool | None = None,
        year_from: int | None = None,
        year_to: int | None = None,
    ) -> StatsResponse:
        """Агрегированная статистика по каталогу с опциональными фильтрами.

        Cache-aside: Redis TTL=60s → при промахе запрос к БД → запись в кэш.
        Graceful degradation: если redis=None или Redis недоступен → прямой запрос к БД.
        """
        if self.redis is None:
            return await self._fetch_stats_from_db(countries, doc_types, open_access, year_from, year_to)

        cache_key = make_stats_cache_key(countries, doc_types, open_access, year_from, year_to)

        try:
            cached = await self.redis.get(cache_key)
            if cached is not None:
                return StatsResponse.model_validate_json(cached)
        except Exception:
            logger.warning("Redis GET failed, falling back to DB", exc_info=True)

        result = await self._fetch_stats_from_db(countries, doc_types, open_access, year_from, year_to)

        try:
            await self.redis.setex(cache_key, STATS_CACHE_TTL, result.model_dump_json())
        except Exception:
            logger.warning("Redis SETEX failed, cache skipped", exc_info=True)

        return result

    async def _fetch_stats_from_db(
        self,
        countries: list[str] | None,
        doc_types: list[str] | None,
        open_access: bool | None,
        year_from: int | None,
        year_to: int | None,
    ) -> StatsResponse:
        raw = await self.catalog_repo.get_stats(
            countries=countries,
            doc_types=doc_types,
            open_access=open_access,
            year_from=year_from,
            year_to=year_to,
        )

        # Конвертируем сырые dict-списки в типизированные Pydantic-схемы
        return StatsResponse(
            total_articles=raw["total_articles"],
            total_journals=raw["total_journals"],
            total_countries=raw["total_countries"],
            total_authors=raw["total_authors"],
            open_access_count=raw["open_access_count"],
            by_year=[CountByField(label=str(r["year"]), count=r["count"]) for r in raw["by_year"]],
            by_journal=[CountByField(label=r["journal"], count=r["count"]) for r in raw["by_journal"]],
            by_country=[CountByField(label=r["country"], count=r["count"]) for r in raw["by_country"]],
            by_doc_type=[CountByField(label=r["doc_type"], count=r["count"]) for r in raw["by_doc_type"]],
            top_keywords=[CountByField(label=r["keyword"], count=r["count"]) for r in raw["top_keywords"]],
            top_authors=[CountByField(label=r["author"], count=r["count"]) for r in raw["top_authors"]],
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
