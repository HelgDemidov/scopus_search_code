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
        year_from: int | None = None,
        year_to: int | None = None,
        doc_types: list[str] | None = None,
        open_access: bool | None = None,
        countries: list[str] | None = None,
    ) -> List[Article]:
        """
        Возвращает статьи каталога с пагинацией и опциональными фильтрами.
        keyword:     точное совпадение с ключевым словом сидера; None — без фильтра.
        search:      ILIKE-поиск по title и author; None — без fulltext-фильтра.
        year_from:   год публикации >= year_from; None — без нижней границы.
        year_to:     год публикации <= year_to; None — без верхней границы.
        doc_types:   фильтр по типу документа (Article, Review и т.д.); None — все типы.
        open_access: True — только OA; False — только не-OA; None — все.
        countries:   фильтр по стране аффилиации (один или несколько); None — все страны.
        """
        pass

    @abstractmethod
    async def get_total_count(
        self,
        keyword: str | None = None,
        search: str | None = None,
        year_from: int | None = None,
        year_to: int | None = None,
        doc_types: list[str] | None = None,
        open_access: bool | None = None,
        countries: list[str] | None = None,
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
