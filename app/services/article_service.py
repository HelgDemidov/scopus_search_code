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
    ) -> PaginatedArticleResponse:
        # Бизнес-логика пагинации с опциональным фильтром по ключевому слову

        # Защита от отрицательных значений
        if page < 1:
            page = 1
        if size < 1:
            size = 10

        limit = size
        offset = (page - 1) * size

        # 1. Получаем ORM-объекты из БД; keyword=None означает без фильтра
        db_articles = await self.article_repo.get_all(limit=limit, offset=offset, keyword=keyword)
        total = await self.article_repo.get_total_count(keyword=keyword)

        # 2. Конвертируем ORM-объекты (Article) в Pydantic-схемы (ArticleResponse)
        article_responses = [
            ArticleResponse.model_validate(article)
            for article in db_articles
        ]

        # 3. Возвращаем правильный тип
        return PaginatedArticleResponse(
            articles=article_responses,
            total=total
        )

    async def get_stats(self) -> dict:
        # Делегируем агрегацию репозиторию — сервис не знает о SQL
        return await self.article_repo.get_stats()
