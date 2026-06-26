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
    def build_query(self, keyword: str, filters: dict | None = None) -> str:
        # Строит итоговую строку CQL-запроса из ключевого слова и фильтров.
        # Выделен в контракт, чтобы SearchService мог получить финальный
        # запрос без зависимости от приватной детали конкретной реализации.
        # Любая альтернативная реализация (PubMed, Semantic Scholar) обязана
        # предоставить свою версию построителя запроса
        pass

    @abstractmethod
    async def search(
        self,
        keyword: str,
        count: int = 25,
        filters: dict | None = None,  # Параметры серверной фильтрации от клиента
        start: int = 0,  # Offset для пагинации (Scopus free: max 5000)
    ) -> List[Article]:
        # Выполняет поиск по ключевому слову и возвращает список ORM-объектов Article.
        # count — макс. кол-во результатов (Scopus free API cap: 25).
        # start — offset пагинации; Scopus free допускает до start=4975 (5000 результатов).
        # filters — опциональный словарь с ключами: year_from, year_to,
        #           document_types (list[str]), open_access (bool), countries (list[str])
        pass
