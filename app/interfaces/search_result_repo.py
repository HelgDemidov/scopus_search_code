# Интерфейс репозитория результатов пользовательского поиска
import datetime
from abc import ABC, abstractmethod
from typing import List

from app.models.article import Article


class ISearchResultRepository(ABC):

    @abstractmethod
    async def save_results(
        self,
        search_history_id: int,
        articles: List[Article],
    ) -> None:
        """
        Связывает статьи с записью истории поиска через search_result_articles.
        articles должны иметь заполненные id (получены после upsert в articles).
        Не вызывает commit() — управление транзакцией на стороне вызывающего кода.
        """
        pass

    @abstractmethod
    async def get_results_by_history_id(
        self,
        search_history_id: int,
        user_id: int,
    ) -> List[Article] | None:
        """
        Возвращает статьи конкретного поиска, упорядоченные по rank.
        user_id используется для проверки ownership через JOIN с search_history.
        Возвращает None если запись не найдена или принадлежит другому пользователю.
        """
        pass

    @abstractmethod
    async def get_search_stats_for_user(
        self,
        user_id: int,
        search: str | None = None,
        since: datetime.datetime | None = None,
    ) -> dict:
        """
        Возвращает агрегаты по статьям из поисков конкретного пользователя:
        total, by_year, by_journal, by_country, by_doc_type.
        search: опциональный ILIKE-фильтр по title/author статей.
        since: опциональный фильтр — только поиски начиная с этой даты.
        """
        pass
