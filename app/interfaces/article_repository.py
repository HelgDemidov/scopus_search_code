from abc import ABC, abstractmethod
from typing import List

from app.models.article import Article


class IArticleRepository(ABC):

    @abstractmethod
    async def save_many(self, articles: List[Article]) -> None:
        """Сохраняет пачку (список) статей в базу данных за один раз"""
        pass

    @abstractmethod
    async def get_all(self, limit: int, offset: int, keyword: str | None = None) -> List[Article]:
        """
        Возвращает статьи из базы с поддержкой пагинации и опциональным фильтром.
        limit: сколько статей вернуть (размер страницы).
        offset: сколько статей пропустить с начала.
        keyword: если передан — фильтрует по точному совпадению с полем keyword;
                 если None — возвращает все статьи без фильтрации.
        """
        pass

    @abstractmethod
    async def get_total_count(self, keyword: str | None = None) -> int:
        """
        Считает общее количество статей в базе.
        keyword: если передан — считает только статьи с этим ключевым словом;
                 если None — считает все статьи.
        """
        pass

    @abstractmethod
    async def get_stats(self) -> dict:
        """Возвращает агрегированную статистику по сидированным статьям (is_seeded=True)"""
        pass
