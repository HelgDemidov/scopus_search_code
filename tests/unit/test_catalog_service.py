# tests/unit/test_catalog_service.py
from datetime import date
from typing import List

import pytest

from typing import cast
from sqlalchemy.ext.asyncio import AsyncSession

from app.interfaces.article_repository import IArticleRepository
from app.interfaces.catalog_repository import ICatalogRepository
from app.models.article import Article
from app.schemas.article_schemas import PaginatedArticleResponse, StatsResponse
from app.services.catalog_service import CatalogService


# ================================================================ #
#  Фейковые реализации интерфейсов                                  #
# ================================================================ #

class FakeArticleRepository(IArticleRepository):
    def __init__(self):
        self.upsert_many_calls: List[List[Article]] = []

    async def upsert_many(self, articles: List[Article]) -> List[Article]:
        self.upsert_many_calls.append(list(articles))
        for i, a in enumerate(articles, start=1):
            a.id = i
        return list(articles)

    async def get_by_id(self, article_id: int, user_id: int | None = None) -> Article | None:
        return None


class FakeCatalogRepository(ICatalogRepository):
    def __init__(self, articles: List[Article] | None = None, total: int = 0):
        self._articles = articles or []
        self._total = total
        self.get_all_calls: list[dict] = []
        self.save_seeded_calls: list[dict] = []
        self.stats_call_count = 0

    async def get_all(
        self,
        limit: int,
        offset: int,
        keyword: str | None = None,
        search: str | None = None,
    ) -> List[Article]:
        self.get_all_calls.append(
            {"limit": limit, "offset": offset, "keyword": keyword, "search": search}
        )
        # Имитируем SQL LIMIT/OFFSET
        return self._articles[offset: offset + limit]

    async def get_total_count(
        self,
        keyword: str | None = None,
        search: str | None = None,
    ) -> int:
        return self._total

    async def save_seeded(self, articles: List[Article], keyword: str) -> List[Article]:
        self.save_seeded_calls.append({"articles": list(articles), "keyword": keyword})
        return list(articles)

    async def get_stats(self) -> dict:
        self.stats_call_count += 1
        # Минимальный корректный словарь, совпадающий с тем, что ожидает CatalogService.get_stats()
        return {
            "total_articles": 42,
            "total_journals": 10,
            "total_countries": 5,
            "open_access_count": 7,
            "by_year": [{"year": 2025, "count": 20}, {"year": 2024, "count": 22}],
            "by_journal": [{"journal": "Nature", "count": 15}],
            "by_country": [{"country": "USA", "count": 30}],
            "by_doc_type": [{"doc_type": "Article", "count": 40}],
            "top_keywords": [{"keyword": "deep learning", "count": 12}],
        }


class FakeSession:
    def __init__(self):
        self.commit_call_count = 0

    async def commit(self) -> None:
        self.commit_call_count += 1


# ================================================================ #
#  Хелперы                                                         #
# ================================================================ #

def _mk_article(article_id: int) -> Article:
    return Article(
        id=article_id,
        title=f"Article {article_id}",
        author="Author",
        publication_date=date(2026, 1, 1),
        doi=f"10.test/{article_id}",
    )


def _mk_service(
    articles: List[Article] | None = None,
    total: int = 0,
) -> tuple[CatalogService, FakeArticleRepository, FakeCatalogRepository, FakeSession]:
    ar = FakeArticleRepository()
    cr = FakeCatalogRepository(articles=articles, total=total)
    sess = FakeSession()
    svc = CatalogService(article_repo=ar, catalog_repo=cr, session=cast(AsyncSession, sess))
    return svc, ar, cr, sess


# ================================================================ #
#  Тесты get_catalog_paginated                                     #
# ================================================================ #

@pytest.mark.asyncio
async def test_get_catalog_paginated_page1_correct_limit_offset():
    svc, _, cr, _ = _mk_service(
        articles=[_mk_article(i) for i in range(1, 11)],
        total=25,
    )

    result = await svc.get_catalog_paginated(page=1, size=10)

    assert isinstance(result, PaginatedArticleResponse)
    assert result.total == 25
    assert len(result.articles) == 10
    call = cr.get_all_calls[0]
    assert call["limit"] == 10
    assert call["offset"] == 0


@pytest.mark.asyncio
async def test_get_catalog_paginated_page3_partial():
    # 25 статей, страница 3 size=10 → статьи 21–25 (5 шт.)
    all_articles = [_mk_article(i) for i in range(1, 26)]
    svc, _, cr, _ = _mk_service(articles=all_articles, total=25)

    result = await svc.get_catalog_paginated(page=3, size=10)

    assert len(result.articles) == 5
    call = cr.get_all_calls[0]
    assert call["limit"] == 10
    assert call["offset"] == 20


@pytest.mark.asyncio
async def test_get_catalog_paginated_negative_page_clamped_to_1():
    svc, _, cr, _ = _mk_service(articles=[_mk_article(1)], total=1)

    result = await svc.get_catalog_paginated(page=-3, size=10)

    # offset должен быть 0 (страница зажата до 1)
    assert cr.get_all_calls[0]["offset"] == 0
    assert result.total == 1


@pytest.mark.asyncio
async def test_get_catalog_paginated_passes_filters():
    svc, _, cr, _ = _mk_service(articles=[], total=0)

    await svc.get_catalog_paginated(page=1, size=5, keyword="LLM", search="transformer")

    call = cr.get_all_calls[0]
    assert call["keyword"] == "LLM"
    assert call["search"] == "transformer"


# ================================================================ #
#  Тесты get_stats                                                 #
# ================================================================ #

@pytest.mark.asyncio
async def test_get_stats_returns_stats_response():
    svc, _, cr, _ = _mk_service()

    result = await svc.get_stats()

    assert isinstance(result, StatsResponse)
    assert result.total_articles == 42
    assert result.total_journals == 10
    assert result.total_countries == 5
    assert result.open_access_count == 7


@pytest.mark.asyncio
async def test_get_stats_maps_by_year_to_count_by_field():
    svc, _, _, _ = _mk_service()

    result = await svc.get_stats()

    assert len(result.by_year) == 2
    assert result.by_year[0].label == "2025"
    assert result.by_year[0].count == 20


@pytest.mark.asyncio
async def test_get_stats_maps_top_keywords():
    svc, _, _, _ = _mk_service()

    result = await svc.get_stats()

    assert len(result.top_keywords) == 1
    assert result.top_keywords[0].label == "deep learning"
    assert result.top_keywords[0].count == 12


@pytest.mark.asyncio
async def test_get_stats_delegates_to_catalog_repo():
    svc, _, cr, _ = _mk_service()

    await svc.get_stats()

    # Ровно один вызов get_stats() в репозиторий
    assert cr.stats_call_count == 1


# ================================================================ #
#  Тесты seed                                                      #
# ================================================================ #

@pytest.mark.asyncio
async def test_seed_calls_upsert_then_save_seeded_then_commit():
    """seed() должен: upsert_many → save_seeded → commit() — в таком порядке."""
    svc, ar, cr, sess = _mk_service()
    articles = [_mk_article(i) for i in range(1, 4)]

    result = await svc.seed(articles=articles, keyword="LLM")

    # upsert_many вызван с исходными статьями
    assert len(ar.upsert_many_calls) == 1
    assert len(ar.upsert_many_calls[0]) == 3

    # save_seeded вызван с правильным keyword и статьями с id
    assert len(cr.save_seeded_calls) == 1
    sc = cr.save_seeded_calls[0]
    assert sc["keyword"] == "LLM"
    assert len(sc["articles"]) == 3
    assert all(a.id is not None for a in sc["articles"])

    # commit вызван ровно раз
    assert sess.commit_call_count == 1

    # Результат — статьи с id
    assert len(result) == 3


@pytest.mark.asyncio
async def test_seed_passes_keyword_to_save_seeded():
    svc, _, cr, _ = _mk_service()

    await svc.seed(articles=[_mk_article(1)], keyword="Neuromorphic Computing")

    assert cr.save_seeded_calls[0]["keyword"] == "Neuromorphic Computing"


@pytest.mark.asyncio
async def test_seed_upsert_failure_skips_save_seeded_and_commit():
    """Если upsert_many бросил — save_seeded и commit не вызываются."""

    class BrokenArticleRepo(IArticleRepository):
        async def upsert_many(self, articles):
            raise RuntimeError("db down")

        async def get_by_id(self, article_id, user_id=None):
            return None

    cr = FakeCatalogRepository()
    sess = FakeSession()
    svc = CatalogService(article_repo=BrokenArticleRepo(), catalog_repo=cr, session=cast(AsyncSession, sess))

    with pytest.raises(RuntimeError, match="db down"):
        await svc.seed(articles=[_mk_article(1)], keyword="AI")

    assert cr.save_seeded_calls == []
    assert sess.commit_call_count == 0
