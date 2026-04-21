from typing import List

from app.models.article import Article
from app.interfaces.article_repository import IArticleRepository
from app.interfaces.search_client import ISearchClient
from app.interfaces.search_history_repo import ISearchHistoryRepository


class SearchService:
    # Оркестрирует поиск: получает данные от внешнего клиента,
    # сохраняет их через репозиторий и фиксирует запрос в истории.
    # Не знает ни про httpx, ни про SQLAlchemy.
    def __init__(
        self,
        search_client: ISearchClient,
        article_repo: IArticleRepository,
        history_repo: ISearchHistoryRepository,
    ):
        self.search_client = search_client
        self.article_repo = article_repo
        self.history_repo = history_repo

    async def find_and_save(
        self,
        keyword: str,
        count: int = 25,
        *,
        user_id: int,
        filters: dict | None = None,
    ) -> List[Article]:
        # 1. Идем в Scopus и получаем список статей
        articles = await self.search_client.search(keyword=keyword, count=count)

        if not articles:
            return []

        # 2. Сохраняем статьи и получаем их обратно с id из БД —
        # объекты от Scopus не имеют id (server-generated).
        saved = await self.article_repo.save_many(articles)

        # 3. После успешного сохранения фиксируем запрос в истории.
        # Если save_many бросит — история не пишется (эксепшен пройдёт выше).
        await self.history_repo.insert_row(
            user_id=user_id,
            query=keyword,
            result_count=len(saved),
            filters=filters,
        )
        return saved
