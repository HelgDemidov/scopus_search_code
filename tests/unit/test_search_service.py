# tests/unit/test_search_service.py
import datetime
from datetime import date
from typing import List
from unittest.mock import AsyncMock

import pytest

from typing import cast
from sqlalchemy.ext.asyncio import AsyncSession

from app.interfaces.article_repository import IArticleRepository
from app.interfaces.search_client import ISearchClient
from app.interfaces.search_history_repo import ISearchHistoryRepository
from app.interfaces.search_result_repo import ISearchResultRepository
from app.models.article import Article
from app.models.search_history import SearchHistory
from app.services.search_service import SearchService


# ================================================================ #
#  Фейковые реализации интерфейсов                                  #
# ================================================================ #

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
        # upsert_many — единственный метод, который использует SearchService
        self.upsert_many_calls: List[List[Article]] = []

    async def upsert_many(self, articles: List[Article]) -> List[Article]:
        self.upsert_many_calls.append(list(articles))
        if self._raise is not None:
            raise self._raise
        # Присваиваем id, имитируя возврат из БД
        out = []
        for i, a in enumerate(articles, start=1):
            a.id = i
            out.append(a)
        return out

    async def get_by_id(self, article_id: int, user_id: int | None = None) -> Article | None:
        return None


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

    async def count_in_window(self, user_id: int, since: datetime.datetime) -> int:
        return 0

    async def get_last_n(self, user_id: int, n: int = 100):
        return []

    async def get_oldest_in_window_created_at(
        self, user_id: int, since: datetime.datetime
    ) -> datetime.datetime | None:
        return None


class FakeSearchResultRepository(ISearchResultRepository):
    def __init__(self):
        self.save_results_calls: list[dict] = []

    async def save_results(
        self,
        search_history_id: int,
        articles: List[Article],
    ) -> None:
        self.save_results_calls.append({
            "search_history_id": search_history_id,
            "articles": list(articles),
        })

    async def get_results_by_history_id(
        self, search_history_id: int, user_id: int
    ) -> List[Article] | None:
        return None

    async def get_search_stats_for_user(
        self,
        user_id: int,
        search: str | None = None,
        since: datetime.datetime | None = None,
    ) -> dict:
        return {}


class FakeSession:
    """Минимальная заглушка AsyncSession — только commit()."""
    def __init__(self):
        self.commit_call_count = 0

    async def commit(self) -> None:
        self.commit_call_count += 1


# ================================================================ #
#  Хелпер                                                          #
# ================================================================ #

def _mk_article(doi: str = "10.test/1") -> Article:
    return Article(
        title="T",
        author="A",
        publication_date=date(2026, 1, 1),
        doi=doi,
        keyword=None,
        is_seeded=False,
    )


def _mk_service(
    articles: List[Article] | None = None,
    search_raise: Exception | None = None,
    upsert_raise: Exception | None = None,
) -> tuple[SearchService, FakeSearchClient, FakeArticleRepository,
           FakeSearchHistoryRepository, FakeSearchResultRepository, FakeSession]:
    sc = FakeSearchClient(articles=articles, raise_exc=search_raise)
    ar = FakeArticleRepository(raise_exc=upsert_raise)
    hr = FakeSearchHistoryRepository()
    sr = FakeSearchResultRepository()
    sess = FakeSession()
    svc = SearchService(
        search_client=sc,
        article_repo=ar,
        history_repo=hr,
        search_result_repo=sr,
        session=cast(AsyncSession, sess),
    )
    return svc, sc, ar, hr, sr, sess


# ================================================================ #
#  Тесты конструктора                                              #
# ================================================================ #

@pytest.mark.asyncio
async def test_constructor_stores_all_dependencies():
    svc, sc, ar, hr, sr, sess = _mk_service()
    assert svc.search_client is sc
    assert svc.article_repo is ar
    assert svc.history_repo is hr
    assert svc.search_result_repo is sr
    assert svc.session is sess


# ================================================================ #
#  Тесты find_and_save — happy path                                #
# ================================================================ #

@pytest.mark.asyncio
async def test_find_and_save_success_full_pipeline():
    """Успешный путь: search → upsert_many → insert_row → save_results → commit."""
    svc, sc, ar, hr, sr, sess = _mk_service(
        articles=[_mk_article("10.test/1"), _mk_article("10.test/2")]
    )

    result = await svc.find_and_save("AI", count=10, user_id=7, filters={"year_from": 2020})

    # 1. Клиент вызван с правильными параметрами
    assert sc.last_keyword == "AI"
    assert sc.last_count == 10

    # 2. upsert_many вызван один раз с 2 статьями
    assert len(ar.upsert_many_calls) == 1
    assert len(ar.upsert_many_calls[0]) == 2

    # 3. История записана с правильными полями
    assert len(hr.insert_calls) == 1
    call = hr.insert_calls[0]
    assert call["user_id"] == 7
    assert call["query"] == "AI"
    assert call["result_count"] == 2
    assert call["filters"] == {"year_from": 2020}

    # 4. save_results вызван с корректным search_history_id и статьями с id
    assert len(sr.save_results_calls) == 1
    sr_call = sr.save_results_calls[0]
    assert sr_call["search_history_id"] == 1  # первая запись истории → id=1
    assert len(sr_call["articles"]) == 2
    assert all(a.id is not None for a in sr_call["articles"])

    # 5. commit() вызван ровно один раз
    assert sess.commit_call_count == 1

    # 6. Результат возвращает статьи с id
    assert len(result) == 2


@pytest.mark.asyncio
async def test_find_and_save_passes_count_to_search_client():
    svc, sc, *_ = _mk_service(articles=[_mk_article()])
    await svc.find_and_save("ML", count=7, user_id=1)
    assert sc.last_keyword == "ML"
    assert sc.last_count == 7


@pytest.mark.asyncio
async def test_find_and_save_filters_default_none_passed_through():
    svc, _, _, hr, *_ = _mk_service(articles=[_mk_article()])
    await svc.find_and_save("AI", user_id=42)
    assert hr.insert_calls[0]["filters"] is None


# ================================================================ #
#  Тесты find_and_save — пустой результат                          #
# ================================================================ #

@pytest.mark.asyncio
async def test_find_and_save_empty_returns_empty_and_skips_pipeline():
    """Если Scopus вернул 0 статей — никаких записей в БД, commit не вызван."""
    svc, _, ar, hr, sr, sess = _mk_service(articles=[])

    result = await svc.find_and_save("AI", user_id=1)

    assert result == []
    assert ar.upsert_many_calls == []
    assert hr.insert_calls == []
    assert sr.save_results_calls == []
    assert sess.commit_call_count == 0


# ================================================================ #
#  Тесты find_and_save — обработка ошибок                          #
# ================================================================ #

@pytest.mark.asyncio
async def test_find_and_save_search_exception_skips_all_db_ops():
    """Если Scopus упал — ничего в БД не пишем, commit не вызван."""
    svc, _, ar, hr, sr, sess = _mk_service(search_raise=RuntimeError("scopus down"))

    with pytest.raises(RuntimeError, match="scopus down"):
        await svc.find_and_save("AI", user_id=1)

    assert ar.upsert_many_calls == []
    assert hr.insert_calls == []
    assert sr.save_results_calls == []
    assert sess.commit_call_count == 0


@pytest.mark.asyncio
async def test_find_and_save_upsert_exception_skips_history_and_results():
    """Если upsert_many упал — история и search_results не пишутся, commit не вызван."""
    svc, _, ar, hr, sr, sess = _mk_service(
        articles=[_mk_article()],
        upsert_raise=RuntimeError("db down"),
    )

    with pytest.raises(RuntimeError, match="db down"):
        await svc.find_and_save("AI", user_id=1)

    assert len(ar.upsert_many_calls) == 1  # upsert вызван, но бросил
    assert hr.insert_calls == []           # история НЕ записана
    assert sr.save_results_calls == []     # результаты НЕ записаны
    assert sess.commit_call_count == 0     # commit НЕ вызван