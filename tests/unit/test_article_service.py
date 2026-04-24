# tests/unit/test_article_service.py
from datetime import date
from typing import List

import pytest

from app.interfaces.article_repository import IArticleRepository
from app.models.article import Article
from app.schemas.article_schemas import ArticleResponse
from app.services.article_service import ArticleService


# ================================================================ #
#  Фейковый репозиторий                                            #
# ================================================================ #

class FakeArticleRepository(IArticleRepository):
    """Заглушка IArticleRepository — реализует только методы, существующие в интерфейсе."""

    def __init__(self, articles: list[Article] | None = None):
        # Словарь id → Article для имитации хранилища
        self._store: dict[int, Article] = {}
        for a in (articles or []):
            if a.id is not None:
                self._store[a.id] = a

    async def upsert_many(self, articles: List[Article]) -> List[Article]:
        # Не нужен для тестов ArticleService — просто заглушка
        return articles

    async def get_by_id(
        self,
        article_id: int,
        user_id: int | None = None,
    ) -> Article | None:
        return self._store.get(article_id)


# ================================================================ #
#  Хелперы                                                         #
# ================================================================ #

def _mk_article(article_id: int, doi: str | None = None) -> Article:
    return Article(
        id=article_id,
        title=f"Article {article_id}",
        author="Test Author",
        publication_date=date(2026, 1, 1),
        doi=doi or f"10.test/{article_id}",
    )


# ================================================================ #
#  Тесты get_by_id                                                 #
# ================================================================ #

@pytest.mark.asyncio
async def test_get_by_id_found_returns_article_response():
    article = _mk_article(1)
    repo = FakeArticleRepository(articles=[article])
    svc = ArticleService(article_repo=repo)

    result = await svc.get_by_id(article_id=1)

    assert result is not None
    assert isinstance(result, ArticleResponse)
    assert result.id == 1
    assert result.title == "Article 1"


@pytest.mark.asyncio
async def test_get_by_id_not_found_returns_none():
    repo = FakeArticleRepository(articles=[])
    svc = ArticleService(article_repo=repo)

    result = await svc.get_by_id(article_id=999)

    assert result is None


@pytest.mark.asyncio
async def test_get_by_id_passes_user_id_to_repo():
    """Сервис должен передавать user_id в репозиторий (visibility check)."""
    received: dict = {}

    class SpyRepo(IArticleRepository):
        async def upsert_many(self, articles):
            return articles

        async def get_by_id(self, article_id: int, user_id: int | None = None):
            received["article_id"] = article_id
            received["user_id"] = user_id
            return None

    svc = ArticleService(article_repo=SpyRepo())
    await svc.get_by_id(article_id=5, user_id=42)

    assert received["article_id"] == 5
    assert received["user_id"] == 42


@pytest.mark.asyncio
async def test_get_by_id_without_user_id_passes_none():
    """Вызов без user_id — в репозиторий передаётся None (без visibility check)."""
    received: dict = {}

    class SpyRepo(IArticleRepository):
        async def upsert_many(self, articles):
            return articles

        async def get_by_id(self, article_id: int, user_id: int | None = None):
            received["user_id"] = user_id
            return None

    svc = ArticleService(article_repo=SpyRepo())
    await svc.get_by_id(article_id=1)

    assert received["user_id"] is None


@pytest.mark.asyncio
async def test_get_by_id_found_maps_all_fields():
    """model_validate корректно проецирует ORM-объект в ArticleResponse."""
    article = Article(
        id=7,
        title="Deep Learning Survey",
        author="Hinton G.",
        publication_date=date(2025, 3, 15),
        doi="10.acm/dl-survey",
        journal="Nature",
        affiliation_country="UK",
        document_type="Review",
        open_access=True,
    )
    repo = FakeArticleRepository(articles=[article])
    svc = ArticleService(article_repo=repo)

    result = await svc.get_by_id(article_id=7)

    assert result is not None
    assert result.title == "Deep Learning Survey"
    assert result.author == "Hinton G."
    assert result.doi == "10.acm/dl-survey"
    assert result.journal == "Nature"
    assert result.affiliation_country == "UK"
    assert result.open_access is True
