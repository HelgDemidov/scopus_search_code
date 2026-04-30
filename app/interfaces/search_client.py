from abc import ABC, abstractmethod
from typing import List

from app.models.article import Article


class ISearchClient(ABC):
    # Контракт для любого внешнего поискового клиента.
    # Благодаря этому интерфейсу можно заменить Scopus на PubMed
    # или Semantic Scholar, не трогая SearchService (принцип O из SOLID).
    # last_rate_* — часть контракта: роутер вправе читать их
    # у любой реализации. None означает «данные ещё не получены».
    # last_cql_query — итоговый CQL-запрос, отправленный в Scopus;
    # используется SearchService для сохранения в историю поиска.

    @property
    @abstractmethod
    def last_rate_limit(self) -> str | None: ...

    @property
    @abstractmethod
    def last_rate_remaining(self) -> str | None: ...

    @property
    @abstractmethod
    def last_rate_reset(self) -> str | None: ...

    @property
    @abstractmethod
    def last_cql_query(self) -> str | None:
        # Возвращает последний сформированный CQL-запрос.
        # None — если search() ещё не вызывался на этом экземпляре.
        ...

    @abstractmethod
    async def search(
        self,
        keyword: str,
        count: int = 25,
        filters: dict | None = None,
    ) -> List[Article]:
        # Выполняет поиск по ключевому слову и возвращает список ORM-объектов Article.
        # count — макс. кол-во результатов (по бесплатному лимиту Scopus API Key — 25).
        # filters — опциональный словарь параметров для построения CQL-запроса:
        #   year_from: int        — нижняя граница года публикации
        #   year_to: int          — верхняя граница года публикации
        #   doc_types: list[str]  — типы документов (human-readable, см. _DOC_TYPE_MAP)
        #   open_access: bool     — только Open Access статьи
        #   country: list[str]    — страны аффиляции авторов
        pass
