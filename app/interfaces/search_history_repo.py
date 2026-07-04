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
        scopus_query: str | None = None,
    ) -> SearchHistory:
        """
        Вставляет одну запись в search_history и возвращает её с заполненными
        id и created_at из БД. filters=None сохраняется как {}.
        scopus_query — итоговый CQL-запрос, отправленный в Scopus API.
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

    @abstractmethod
    async def trim_to_last_n(
        self,
        user_id: int,
        n: int,
        keep_since: datetime.datetime | None = None,
    ) -> int:
        """
        Retention: удаляет для user_id все строки истории сверх последних n
        (по created_at DESC, id DESC как tie-break). Возвращает число удалённых строк.
        Идемпотентно — если строк <= n, ничего не удаляет.
        Вызывается внутри SearchService.find_and_save сразу после insert_row —
        новая запись всегда самая свежая и переживает trim (docs/personal-search-data/spec.md §1).

        keep_since: если задан — строки с created_at >= keep_since НИКОГДА не удаляются,
        даже если их больше n. Обязателен для прод-вызова: без этого предохранителя
        retention может удалить строки, ещё учитываемые в count_in_window() для недельной
        квоты (HISTORY_DEPTH_LIMIT=100 < QUOTA_LIMIT=200) — used начнёт занижаться, и
        429 станет недостижим для активных пользователей. SearchService передаёт сюда
        начало 7-дневного квотного окна.
        """
        pass
