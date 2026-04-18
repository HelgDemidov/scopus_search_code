from typing import List

from app.models.article import Article
from app.interfaces.article_repository import IArticleRepository
from app.interfaces.search_client import ISearchClient


class SearchService:
    # Оркестрирует поиск: получает данные от внешнего клиента
    # и сохраняет их через репозиторий. Не знает ни про httpx, ни про SQLAlchemy.
    def __init__(self, search_client: ISearchClient, article_repo: IArticleRepository):
        self.search_client = search_client
        self.article_repo = article_repo

    async def find_and_save(self, keyword: str, count: int = 25) -> List[Article]:
        # 1. Идем в Scopus и получаем список статей
        articles = await self.search_client.search(keyword=keyword, count=25)

        if not articles:
            return []

        # 2. Сохраняем статьи и получаем их обратно с id из БД —
        # объекты от Scopus не имеют id (server-generated), поэтому
        # возвращаем именно то, что вернул репозиторий после перечитывания
        return await self.article_repo.save_many(articles)
