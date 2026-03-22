from abc import ABC, abstractmethod
from typing import List
from app.models.article import Article


class ISearchClient(ABC):
    # Контракт для любого внешнего поискового клиента.
    # Благодаря этому интерфейсу мы можем легко заменить Scopus
    # на PubMed или Semantic Scholar, не трогая SearchService (принцип O из SOLID).

    @abstractmethod
    async def search(self, keyword: str, count: int = 10) -> List[Article]:
        # Выполняет поиск по ключевому слову и возвращает список ORM-объектов Article.
        # count — максимальное количество результатов (по ТЗ = 10).
        pass
