import datetime
from datetime import date
from typing import List

import pytest

from app.interfaces.article_repository import IArticleRepository
from app.interfaces.search_client import ISearchClient
from app.interfaces.search_history_repo import ISearchHistoryRepository
from app.models.article import Article
from app.models.search_history import SearchHistory
from app.services.search_service import SearchService


class FakeSearchClient(ISearchClient):
    def __init__(self, articles: List[Article] | None = None, raise_exc: Exception | None = None):
        self._articles = articles or []
        self._raise = raise_exc
        self.last_keyword: str | None = None
        self.last_count: int | None = None

    @property
    def last_rate_limit(self) -> str | None:
        return None

    @property
    def last_rate_remaining(self) -> str | None:
        return None

    @property
    def last_rate_reset(self) -> str | None:
        return None

    async def search(self, keyword: str, count: int = 25) -> List[Article]:
        self.last_keyword = keyword
        self.last_count = count
        if self._raise is not None:
            raise self._raise
        return self._articles


class FakeArticleRepository(IArticleRepository):
    def __init__(self, raise_exc: Exception | None = None):
        self._raise = raise_exc
        self.save_many_calls: List[List[Article]] = []

    async def save_many(self, articles: List[Article]) -> List[Article]:
        self.save_many_calls.append(list(articles))
        if self._raise is not None:
            raise self._raise
        # Возвращаем копию с простыми id для имитации вставки
        out = []
        for i, a in enumerate(articles, start=1):
            a.id = i
            out.append(a)
        return out

    async def get_all(self, limit, offset, keyword=None, search=None):
        return []

    async def get_by_id(self, article_id):
        return None

    async def get_total_count(self, keyword=None, search=None):
        return 0

    async def get_search_stats(self, search):
        return {"total": 0, "by_year": [], "by_journal": [], "by_country": [], "by_doc_type": []}

    async def get_stats(self):
        return {}


class FakeSearchHistoryRepository(ISearchHistoryRepository):
    def __init__(self):
        self.insert_calls: list[dict] = []

    async def insert_row(
        self,
        user_id: int,
        query: str,
        result_count: int,
        filters: dict | None = None,
    ) -> SearchHistory:
        self.insert_calls.append({
            "user_id": user_id,
            "query": query,
            "result_count": result_count,
            "filters": filters,
        })
        return SearchHistory(
            id=len(self.insert_calls),
            user_id=user_id,
            query=query,
            result_count=result_count,
            filters=filters or {},
            created_at=datetime.datetime.now(tz=datetime.timezone.utc),
        )

    async def count_in_window(self, user_id, since):
        return 0

    async def get_last_n(self, user_id, n=100):
        return []

    async def get_oldest_in_window_created_at(self, user_id, since):
        return None


def _mk_article(doi: str = "10.test/1") -> Article:
    return Article(
        title="T",
        author="A",
        publication_date=date(2026, 1, 1),
        doi=doi,
        keyword="k",
        is_seeded=False,
    )


@pytest.mark.asyncio
async def test_constructor_stores_history_repo():
    sc = FakeSearchClient()
    ar = FakeArticleRepository()
    hr = FakeSearchHistoryRepository()
    svc = SearchService(search_client=sc, article_repo=ar, history_repo=hr)
    assert svc.history_repo is hr
    assert svc.article_repo is ar
    assert svc.search_client is sc


@pytest.mark.asyncio
async def test_find_and_save_success_calls_save_then_insert_row():
    sc = FakeSearchClient(articles=[_mk_article("10.test/1"), _mk_article("10.test/2")])
    ar = FakeArticleRepository()
    hr = FakeSearchHistoryRepository()
    svc = SearchService(search_client=sc, article_repo=ar, history_repo=hr)

    result = await svc.find_and_save(
        "AI", count=10, user_id=7, filters={"year_from": 2020}
    )

    assert len(result) == 2
    assert len(ar.save_many_calls) == 1
    assert len(hr.insert_calls) == 1
    call = hr.insert_calls[0]
    assert call["user_id"] == 7
    assert call["query"] == "AI"
    assert call["result_count"] == 2
    assert call["filters"] == {"year_from": 2020}


@pytest.mark.asyncio
async def test_find_and_save_empty_returns_and_does_not_insert_history():
    sc = FakeSearchClient(articles=[])
    ar = FakeArticleRepository()
    hr = FakeSearchHistoryRepository()
    svc = SearchService(search_client=sc, article_repo=ar, history_repo=hr)

    result = await svc.find_and_save("AI", user_id=1)

    assert result == []
    assert ar.save_many_calls == []
    assert hr.insert_calls == []


@pytest.mark.asyncio
async def test_find_and_save_search_exception_does_not_save_or_insert():
    sc = FakeSearchClient(raise_exc=RuntimeError("scopus down"))
    ar = FakeArticleRepository()
    hr = FakeSearchHistoryRepository()
    svc = SearchService(search_client=sc, article_repo=ar, history_repo=hr)

    with pytest.raises(RuntimeError):
        await svc.find_and_save("AI", user_id=1)

    assert ar.save_many_calls == []
    assert hr.insert_calls == []


@pytest.mark.asyncio
async def test_find_and_save_save_exception_does_not_insert_history():
    sc = FakeSearchClient(articles=[_mk_article()])
    ar = FakeArticleRepository(raise_exc=RuntimeError("db down"))
    hr = FakeSearchHistoryRepository()
    svc = SearchService(search_client=sc, article_repo=ar, history_repo=hr)

    with pytest.raises(RuntimeError):
        await svc.find_and_save("AI", user_id=1)

    assert len(ar.save_many_calls) == 1
    assert hr.insert_calls == []


@pytest.mark.asyncio
async def test_find_and_save_passes_count_to_search_client():
    sc = FakeSearchClient(articles=[_mk_article()])
    ar = FakeArticleRepository()
    hr = FakeSearchHistoryRepository()
    svc = SearchService(search_client=sc, article_repo=ar, history_repo=hr)

    await svc.find_and_save("AI", count=7, user_id=1)

    assert sc.last_keyword == "AI"
    assert sc.last_count == 7


@pytest.mark.asyncio
async def test_find_and_save_filters_default_none_passed_through():
    sc = FakeSearchClient(articles=[_mk_article()])
    ar = FakeArticleRepository()
    hr = FakeSearchHistoryRepository()
    svc = SearchService(search_client=sc, article_repo=ar, history_repo=hr)

    await svc.find_and_save("AI", user_id=42)

    assert hr.insert_calls[0]["filters"] is None
