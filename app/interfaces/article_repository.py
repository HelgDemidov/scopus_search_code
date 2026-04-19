from abc import ABC, abstractmethod
from typing import List

from app.models.article import Article


class IArticleRepository(ABC):

    @abstractmethod
    async def save_many(self, articles: List[Article]) -> List[Article]:
        """Сохраняет пачку статей в БД и возвращает их с заполненными id из БД"""
        pass

    @abstractmethod
    async def get_all(
        self,
        limit: int,
        offset: int,
        keyword: str | None = None,
        search: str | None = None,
    ) -> List[Article]:
        """
        Возвращает статьи из БД с поддержкой пагинации и опциональными фильтрами.
        limit: сколько статей вернуть (размер страницы).
        offset: сколько статей пропустить с начала.
        keyword: если передан — фильтрует по точному совпадению с полем keyword
                 (фраза сидера); если None — без фильтра по этому полю.
        search: если передан — fulltext ILIKE по полям title и author;
                если None — без fulltext-фильтра.
        """
        pass

    @abstractmethod
    async def get_by_id(self, article_id: int) -> Article | None:
        """Возвращает статью по первичному ключу или None если не найдена"""
        pass

    @abstractmethod
    async def get_total_count(
        self,
        keyword: str | None = None,
        search: str | None = None,
    ) -> int:
        """
        Считает общее количество статей в базе.
        keyword: если передан — считает только статьи с этим ключевым словом;
                 если None — считает все статьи.
        search: если передан — считает только статьи, matching ILIKE по title/author;
                если None — без fulltext-фильтра.
        """
        pass

    @abstractmethod
    async def get_search_stats(self, search: str) -> dict:
        """
        Возвращает агрегаты (total, by_year, by_journal, by_country, by_doc_type)
        по статьям, matching ILIKE-поиску по title/author.
        search обязателен: метод не имеет смысла без фильтра.
        Реализуется одним CTE-запросом — один round-trip к БД.
        """
        pass

    @abstractmethod
    async def get_stats(self) -> dict:
        """Возвращает агрегированную статистику по сидированным статьям (is_seeded=True)"""
        pass
