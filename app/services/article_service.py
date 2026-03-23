
from app.schemas.article_schemas import ArticleResponse, PaginatedArticleResponse
from app.services.interfaces.article_repository import IArticleRepository


class ArticleService:
    def __init__(self, article_repo: IArticleRepository):
        self.article_repo = article_repo

    async def get_articles_paginated(self, page: int, size: int) -> PaginatedArticleResponse:
        
        # Бизнес-логика пагинации
        
        # Защита от отрицательных значений
        if page < 1:
            page = 1
        if size < 1:
            size = 10

        limit = size
        offset = (page - 1) * size

        # 1. Получаем ORM-объекты из БД
        db_articles = await self.article_repo.get_all(limit=limit, offset=offset)
        total = await self.article_repo.get_total_count()

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
