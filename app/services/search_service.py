from typing import List
from app.services.interfaces.search_client import ISearchClient
from app.services.interfaces.article_repository import IArticleRepository
from app.models.article import Article


class SearchService:
    # Оркестрирует поиск: получает данные от внешнего клиента
    # и сохраняет их через репозиторий. Не знает ни про httpx, ни про SQLAlchemy.
    def __init__(self, search_client: ISearchClient, article_repo: IArticleRepository):
        self.search_client = search_client
        self.article_repo = article_repo

    async def find_and_save(self, keyword: str) -> List[Article]:
        # 1. Идем в Scopus и получаем список статей
        articles = await self.search_client.search(keyword=keyword, count=10)

        if not articles:
            return []

        # 2. Сохраняем все найденные статьи в нашу локальную базу
        await self.article_repo.save_many(articles)

        # 3. Возвращаем только что сохраненные статьи
        return articles
