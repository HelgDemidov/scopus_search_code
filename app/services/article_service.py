# Thin-сервис для единственного маршрута GET /articles/{id}
# Пагинация каталога — CatalogService; агрегаты поиска — SearchResultRepository
from app.interfaces.article_repository import IArticleRepository
from app.schemas.article_schemas import ArticleResponse


class ArticleService:
    def __init__(self, article_repo: IArticleRepository):
        self.article_repo = article_repo

    async def get_by_id(
        self,
        article_id: int,
        user_id: int | None = None,
    ) -> ArticleResponse | None:
        """Возвращает статью по id с опциональной проверкой видимости.

        user_id: если передан — статья должна быть в каталоге ИЛИ
                 в результатах поисков этого пользователя (visibility check
                 реализован в postgres_article_repo.get_by_id).
        user_id=None — без проверки владения (для admin/seeder сценариев).
        """
        article = await self.article_repo.get_by_id(article_id, user_id)
        if article is None:
            return None
        return ArticleResponse.model_validate(article)
