# Интерфейс репозитория каталога — статьи, добавленные автоматическим сидером
from abc import ABC, abstractmethod
from typing import List

from app.models.article import Article


class ICatalogRepository(ABC):

    @abstractmethod
    async def get_all(
        self,
        limit: int,
        offset: int,
        keyword: str | None = None,
        search: str | None = None,
    ) -> List[Article]:
        """
        Возвращает статьи каталога с пагинацией и опциональными фильтрами.
        keyword: точное совпадение с ключевым словом сидера; None — без фильтра.
        search: ILIKE-поиск по title и author; None — без fulltext-фильтра.
        """
        pass

    @abstractmethod
    async def get_total_count(
        self,
        keyword: str | None = None,
        search: str | None = None,
    ) -> int:
        """
        Считает статьи каталога с теми же фильтрами, что get_all — для корректной пагинации.
        """
        pass

    @abstractmethod
    async def save_seeded(
        self,
        articles: List[Article],
        keyword: str,
    ) -> List[Article]:
        """
        Сохраняет пачку статей сидера: upsert в articles + запись в catalog_articles.
        Возвращает статьи с заполненными id из БД.
        Не вызывает commit() — управление транзакцией на стороне вызывающего кода.
        """
        pass

    @abstractmethod
    async def get_stats(self) -> dict:
        """
        Возвращает агрегированную статистику по каталогу:
        total_articles, total_journals, total_countries, open_access_count,
        by_year, by_journal, by_country, by_doc_type, top_keywords.
        """
        pass
