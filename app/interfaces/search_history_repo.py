import datetime
from abc import ABC, abstractmethod
from typing import List

from app.models.search_history import SearchHistory


class ISearchHistoryRepository(ABC):

    @abstractmethod
    async def insert_row(
        self,
        user_id: int,
        query: str,
        result_count: int,
        filters: dict | None = None,
    ) -> SearchHistory:
        """
        Вставляет одну запись в search_history и возвращает её с заполненными
        id и created_at из БД. filters=None сохраняется как {}.
        """
        pass

    @abstractmethod
    async def count_in_window(
        self,
        user_id: int,
        since: datetime.datetime,
    ) -> int:
        """
        Считает количество строк для user_id с created_at >= since.
        Используется для проверки недельной квоты перед вставкой.
        """
        pass

    @abstractmethod
    async def get_last_n(
        self,
        user_id: int,
        n: int = 100,
    ) -> List[SearchHistory]:
        """
        Возвращает последние n записей для user_id, упорядоченных
        по created_at DESC. Используется в GET /articles/history.
        """
        pass

    @abstractmethod
    async def get_oldest_in_window_created_at(
        self,
        user_id: int,
        since: datetime.datetime,
    ) -> datetime.datetime | None:
        """
        Возвращает created_at самой старой записи в скользящем окне
        [since, now]. Используется для вычисления reset_at в квотном ответе:
        reset_at = oldest_created_at + 7 days.
        Возвращает None если окно пустое (использованных запросов нет).
        """
        pass
