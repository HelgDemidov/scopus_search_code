from app.schemas.article_schemas import ArticleResponse, PaginatedArticleResponse
from app.interfaces.article_repository import IArticleRepository


class ArticleService:
    def __init__(self, article_repo: IArticleRepository):
        self.article_repo = article_repo

    async def get_articles_paginated(
        self,
        page: int,
        size: int,
        keyword: str | None = None,
        search: str | None = None,
    ) -> PaginatedArticleResponse:
        # Бизнес-логика пагинации с опциональными фильтрами
        # keyword — точное совпадение по фразе сидера (серверный фильтр)
        # search  — fulltext ILIKE по title/author (пользовательский поиск)

        # Защита от отрицательных значений
        if page < 1:
            page = 1
        if size < 1:
            size = 10

        limit = size
        offset = (page - 1) * size

        # Получаем ORM-объекты из БД; оба фильтра независимы
        db_articles = await self.article_repo.get_all(
            limit=limit, offset=offset, keyword=keyword, search=search
        )
        total = await self.article_repo.get_total_count(keyword=keyword, search=search)

        # Конвертируем ORM-объекты (Article) в Pydantic-схемы (ArticleResponse)
        article_responses = [
            ArticleResponse.model_validate(article)
            for article in db_articles
        ]

        return PaginatedArticleResponse(
            articles=article_responses,
            total=total
        )

    async def get_by_id(self, article_id: int) -> ArticleResponse | None:
        # Делегируем репозиторию, конвертируем ORM → Pydantic
        article = await self.article_repo.get_by_id(article_id)
        if article is None:
            return None
        return ArticleResponse.model_validate(article)

    async def get_stats(self) -> dict:
        # Делегируем агрегацию репозиторию — сервис не знает о SQL
        return await self.article_repo.get_stats()
