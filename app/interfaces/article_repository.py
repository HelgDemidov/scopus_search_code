# Базовый интерфейс репозитория статей — низкоуровневые операции с таблицей articles
# Высокоуровневые методы (каталог, поиск) вынесены в ICatalogRepository и ISearchResultRepository
from abc import ABC, abstractmethod
from typing import List

from app.models.article import Article


class IArticleRepository(ABC):

    @abstractmethod
    async def upsert_many(self, articles: List[Article]) -> List[Article]:
        """
        INSERT ON CONFLICT DO UPDATE для пачки статей.
        Возвращает статьи с заполненными id из БД.
        Не вызывает commit() — управление транзакцией на стороне вызывающего кода.
        """
        pass

    @abstractmethod
    async def get_by_id(
        self,
        article_id: int,
        user_id: int | None = None,
    ) -> Article | None:
        """
        Возвращает статью по первичному ключу или None если не найдена.
        user_id: если передан — дополнительно проверяет видимость статьи для пользователя
                 (статья есть в каталоге ИЛИ в поисках этого пользователя);
                 если None — возвращает статью без проверки владения.
        """
        pass
