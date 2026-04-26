# Сервис пользовательского поиска — оркестрирует Scopus API + сохранение результатов
from typing import List

from sqlalchemy.ext.asyncio import AsyncSession

from app.interfaces.article_repository import IArticleRepository
from app.interfaces.search_client import ISearchClient
from app.interfaces.search_history_repo import ISearchHistoryRepository
from app.interfaces.search_result_repo import ISearchResultRepository
from app.models.article import Article


class SearchService:
    """Оркестрирует поиск: Scopus API → upsert статей → история → связка результатов.

    Не знает ни про httpx, ни про SQLAlchemy напрямую.
    Единственная точка, где происходит commit() для всей транзакции поиска.
    """

    def __init__(
        self,
        search_client: ISearchClient,
        article_repo: IArticleRepository,
        history_repo: ISearchHistoryRepository,
        search_result_repo: ISearchResultRepository,
        session: AsyncSession,
    ):
        self.search_client = search_client
        self.article_repo = article_repo
        self.history_repo = history_repo
        self.search_result_repo = search_result_repo
        self.session = session

    async def find_and_save(
        self,
        keyword: str,
        count: int = 25,
        *,
        user_id: int,
        filters: dict | None = None,
    ) -> List[Article]:
        """Выполняет поиск и атомарно сохраняет все результаты.

        Порядок операций (все в одной транзакции):
        1. Запрос к Scopus API
        2. upsert статей в таблицу articles → получаем id
        3. INSERT в search_history → получаем search_history.id
        4. INSERT в search_result_articles с rank = порядок в выдаче Scopus
        5. commit()

        Если любой шаг бросает исключение — транзакция откатывается целиком.
        """
        # Шаг 1: идем в Scopus, получаем статьи без id
        articles = await self.search_client.search(keyword=keyword, count=count)

        if not articles:
            return []

        # Шаг 2: upsert в articles — статьи получают id из БД
        articles_with_ids = await self.article_repo.upsert_many(articles)

        # Шаг 3: фиксируем запрос в search_history — получаем history_row.id
        # Если upsert_many бросил — сюда не дойдем (история не пишется)
        history_row = await self.history_repo.insert_row(
            user_id=user_id,
            query=keyword,
            result_count=len(articles_with_ids),
            filters=filters,
        )

        # Шаг 4: связываем статьи с записью истории через search_result_articles
        # rank = порядковый индекс в выдаче Scopus (0-based)
        await self.search_result_repo.save_results(
            search_history_id=history_row.id,
            articles=articles_with_ids,
        )

        # Шаг 5: единственный commit() — атомарно фиксируем articles +
        # search_history + search_result_articles одной транзакцией
        await self.session.commit()

        return articles_with_ids
