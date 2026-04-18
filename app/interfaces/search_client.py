from abc import ABC, abstractmethod
from typing import List

from app.models.article import Article


class ISearchClient(ABC):
    # Контракт для любого внешнего поискового клиента.
    # Благодаря этому интерфейсу можно заменить Scopus на PubMed
    # или Semantic Scholar, не трогая SearchService (принцип O из SOLID).
    # last_rate_* — часть контракта: роутер вправе читать их
    # у любой реализации. None означает «данные ещё не получены».

    @property
    @abstractmethod
    def last_rate_limit(self) -> str | None: ...

    @property
    @abstractmethod
    def last_rate_remaining(self) -> str | None: ...

    @property
    @abstractmethod
    def last_rate_reset(self) -> str | None: ...

    @abstractmethod
    async def search(self, keyword: str, count: int = 25) -> List[Article]:
        # Выполняет поиск по ключевому слову и возвращает список ORM-объектов Article.
        # count — макс. кол-во результатов (по бесплатному лимиту Scopus API Key — 25)
        pass
