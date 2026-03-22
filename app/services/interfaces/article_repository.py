from abc import ABC, abstractmethod
from typing import List
from app.models.article import Article

class IArticleRepository(ABC):
    
    @abstractmethod
    async def save_many(self, articles: List[Article]) -> None:
        """Сохраняет пачку (список) статей в базу данных за один раз"""
        pass

    @abstractmethod
    async def get_all(self, limit: int, offset: int) -> List[Article]:
        """
        Возвращает статьи из базы с поддержкой пагинации.
        limit: сколько статей вернуть (размер страницы).
        offset: сколько статей пропустить с начала.
        """
        pass

    @abstractmethod
    async def get_total_count(self) -> int:
        """Считает общее количество сохраненных статей в базе"""
        pass
