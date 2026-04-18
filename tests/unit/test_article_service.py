from datetime import date
from typing import List

import pytest

from app.models.article import Article
from app.schemas.article_schemas import PaginatedArticleResponse
from app.services.article_service import ArticleService
from app.interfaces.article_repository import IArticleRepository


# 1. Создаем Fake-репозиторий (Заглушку) для статей
class FakeArticleRepository(IArticleRepository):
    def __init__(self):
        # Имитируем базу данных с 25 статьями
        self.db_articles = []
        for i in range(1, 26):
            article = Article(
                id=i,
                title=f"Test Article {i}",
                author="Test Author",
                publication_date=date(2026, 1, 1),
                doi=f"10.test/{i}",
                keyword="test",
                is_seeded=False,
            )
            self.db_articles.append(article)

        # Эти переменные нужны для проверки (шпионажа), какие параметры передал сервис
        self.last_limit_called = None
        self.last_offset_called = None

    async def save_many(self, articles: List[Article]) -> None:
        # Для этого теста сохранение не нужно, просто ставим заглушку
        pass

    async def get_all(self, limit: int, offset: int, keyword: str | None = None) -> List[Article]:
        # Шпионская логика: запоминаем, с какими аргументами сервис вызвал метод базы
        self.last_limit_called = limit
        self.last_offset_called = offset

        # Эмулируем SQL-запрос: SELECT * FROM articles LIMIT {limit} OFFSET {offset}
        return self.db_articles[offset : offset + limit]

    async def get_by_id(self, article_id: int) -> Article | None:
        # Заглушка: get_by_id не нужен для тестов пагинации
        return None

    async def get_total_count(self, keyword: str | None = None) -> int:
        return len(self.db_articles)

    async def get_stats(self) -> dict:
        # Заглушка: get_stats не нужен для тестов пагинации, возвращаем пустой dict
        return {}


# 2. Фикстура для подготовки сервиса
@pytest.fixture
def article_service() -> tuple[ArticleService, FakeArticleRepository]:
    # Возвращаем и кортеж и сервис, и сам фейковый репозиторий, чтобы проверять "шпионские" переменные
    fake_repo = FakeArticleRepository()
    service = ArticleService(article_repo=fake_repo)
    return service, fake_repo


# 3. Тест 1: Проверка первой страницы
@pytest.mark.asyncio
async def test_get_articles_paginated_page_1(article_service):
    service, fake_repo = article_service

    result = await service.get_articles_paginated(page=1, size=10)

    assert fake_repo.last_limit_called == 10
    assert fake_repo.last_offset_called == 0

    assert isinstance(result, PaginatedArticleResponse)
    assert result.total == 25
    assert len(result.articles) == 10
    assert result.articles[0].title == "Test Article 1"
    assert result.articles[9].title == "Test Article 10"


# 4. Тест 2: Проверка третьей (неполной) страницы
@pytest.mark.asyncio
async def test_get_articles_paginated_page_3(article_service):
    service, fake_repo = article_service

    result = await service.get_articles_paginated(page=3, size=10)

    assert fake_repo.last_limit_called == 10
    assert fake_repo.last_offset_called == 20

    assert len(result.articles) == 5
    assert result.articles[0].title == "Test Article 21"


# 5. Тест 3: Проверка граничных (невалидных) значений
@pytest.mark.asyncio
async def test_get_articles_paginated_negative_page(article_service):
    service, fake_repo = article_service

    result = await service.get_articles_paginated(page=-5, size=10)

    assert fake_repo.last_limit_called == 10
    assert fake_repo.last_offset_called == 0
    assert len(result.articles) == 10
