# tests/unit/test_catalog_service.py
import json
from datetime import date
from typing import List, cast

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.redis_client import STATS_CACHE_TTL, make_journal_impact_cache_key, make_stats_cache_key
from app.interfaces.article_repository import IArticleRepository
from app.interfaces.catalog_repository import ICatalogRepository
from app.models.article import Article
from app.schemas.article_schemas import (
    CountByField,
    CountryImpactPoint,
    JournalCountryCount,
    JournalImpactPoint,
    PaginatedArticleResponse,
    PivotResponse,
    StatsResponse,
    SunburstSegment,
    YearCountryCount,
)
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

    async def delete_orphaned(self) -> int:
        return 0


class FakeCatalogRepository(ICatalogRepository):
    def __init__(self, articles: List[Article] | None = None, total: int = 0):
        self._articles = articles or []
        self._total = total
        self.get_all_calls: list[dict] = []
        self.get_count_calls: list[dict] = []
        self.save_seeded_calls: list[dict] = []
        self.stats_call_count = 0
        self.journal_impact_calls: list[int] = []
        self.pivot_calls: list[dict] = []

    # Сигнатура синхронизирована с ICatalogRepository после добавления фильтров
    async def get_all(
        self,
        limit: int,
        offset: int,
        keyword: str | None = None,
        search: str | None = None,
        year_from: int | None = None,
        year_to: int | None = None,
        doc_types: list[str] | None = None,
        open_access: bool | None = None,
        countries: list[str] | None = None,
    ) -> List[Article]:
        self.get_all_calls.append(
            {
                "limit": limit,
                "offset": offset,
                "keyword": keyword,
                "search": search,
                "year_from": year_from,
                "year_to": year_to,
                "doc_types": doc_types,
                "open_access": open_access,
                "countries": countries,
            }
        )
        # Имитируем SQL LIMIT/OFFSET
        return self._articles[offset : offset + limit]

    # Сигнатура синхронизирована с ICatalogRepository после добавления cap (шаг 1 индексирования)
    async def get_total_count(
        self,
        cap: int,
        keyword: str | None = None,
        search: str | None = None,
        year_from: int | None = None,
        year_to: int | None = None,
        doc_types: list[str] | None = None,
        open_access: bool | None = None,
        countries: list[str] | None = None,
    ) -> tuple[int, bool]:
        self.get_count_calls.append(
            {
                "cap": cap,
                "keyword": keyword,
                "search": search,
                "year_from": year_from,
                "year_to": year_to,
                "doc_types": doc_types,
                "open_access": open_access,
                "countries": countries,
            }
        )
        if self._total > cap:
            return cap, True
        return self._total, False

    async def save_seeded(self, articles: List[Article], keyword: str) -> List[Article]:
        self.save_seeded_calls.append({"articles": list(articles), "keyword": keyword})
        return list(articles)

    async def get_stats(
        self,
        countries: list[str] | None = None,
        doc_types: list[str] | None = None,
        open_access: bool | None = None,
        year_from: int | None = None,
        year_to: int | None = None,
    ) -> dict:
        self.stats_call_count += 1
        # Минимальный корректный словарь, совпадающий с тем, что ожидает CatalogService.get_stats()
        return {
            "total_articles": 42,
            "total_journals": 10,
            "total_countries": 5,
            "total_authors": 8,
            "open_access_count": 7,
            "by_year": [{"year": 2025, "count": 20}, {"year": 2024, "count": 22}],
            "by_journal": [{"journal": "Nature", "count": 15}],
            "by_country": [{"country": "USA", "count": 30}],
            "by_doc_type": [{"doc_type": "Article", "count": 40}],
            "top_keywords": [{"keyword": "deep learning", "count": 12}],
            "top_authors": [{"author": "J. Smith", "count": 5}],
            "by_year_top_countries": [{"year": 2025, "country": "USA", "count": 18}],
            "sunburst_country_open_access": [{"country": "USA", "open_access": True, "count": 9}],
            "top_journals_by_country": [{"journal": "Nature", "country": "USA", "count": 6}],
            "country_impact": [{"country": "USA", "count": 30, "mean_citations": 12.5}],
        }

    async def get_journal_impact(self, max_year: int) -> list[dict]:
        self.journal_impact_calls.append(max_year)
        return [
            {"journal": "Nature", "count": 91, "mean_citations": 80.79, "median_citations": 52.0},
            {"journal": "IEEE Access", "count": 321, "mean_citations": 23.18, "median_citations": 10.0},
        ]

    async def get_pivot(
        self,
        row_dim: str,
        col_dim: str,
        top_n_rows: int,
        top_n_cols: int,
        filter_dim: str | None = None,
        filter_value: str | None = None,
        metric: str = "count",
    ) -> dict:
        self.pivot_calls.append(
            {
                "row_dim": row_dim,
                "col_dim": col_dim,
                "top_n_rows": top_n_rows,
                "top_n_cols": top_n_cols,
                "filter_dim": filter_dim,
                "filter_value": filter_value,
                "metric": metric,
            }
        )
        return {
            "row_labels": ["2023", "2024"],
            "col_labels": ["USA", "China"],
            "matrix": [[10, 5], [20, 8]],
            "cell_counts": [[10, 5], [20, 8]],
            "row_totals": [15, 28],
            "col_totals": [30, 13],
        }


class FakeSession:
    def __init__(self):
        self.commit_call_count = 0

    async def commit(self) -> None:
        self.commit_call_count += 1


class FakeRedis:
    """Тестовый дублёр UpstashRedisClient с управляемым состоянием."""

    def __init__(
        self,
        cached_value: str | None = None,
        raise_on_get: bool = False,
        raise_on_setex: bool = False,
    ) -> None:
        self._cached_value = cached_value
        self._raise_on_get = raise_on_get
        self._raise_on_setex = raise_on_setex
        self.get_call_count = 0
        self.setex_calls: list[tuple[str, int, str]] = []

    async def get(self, key: str) -> str | None:
        self.get_call_count += 1
        if self._raise_on_get:
            raise ConnectionError("Redis unavailable")
        return self._cached_value

    async def setex(self, key: str, seconds: int, value: str) -> None:
        if self._raise_on_setex:
            raise ConnectionError("Redis unavailable")
        self.setex_calls.append((key, seconds, value))


def _minimal_stats_response() -> StatsResponse:
    """Минимальный корректный StatsResponse для тестов кэша."""
    return StatsResponse(
        total_articles=42,
        total_journals=10,
        total_countries=5,
        total_authors=8,
        open_access_count=7,
        by_year=[CountByField(label="2025", count=20)],
        by_journal=[CountByField(label="Nature", count=15)],
        by_country=[CountByField(label="USA", count=30)],
        by_doc_type=[CountByField(label="Article", count=40)],
        top_keywords=[CountByField(label="deep learning", count=12)],
        top_authors=[CountByField(label="J. Smith", count=5)],
        by_year_top_countries=[YearCountryCount(year=2025, country="USA", count=18)],
        sunburst_country_open_access=[SunburstSegment(country="USA", open_access=True, count=9)],
        top_journals_by_country=[JournalCountryCount(journal="Nature", country="USA", count=6)],
        country_impact=[CountryImpactPoint(country="USA", count=30, mean_citations=12.5)],
    )


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


_TEST_DB_NAMESPACE = "postgresql+asyncpg://user:pass@test-host:5432/db"


def _mk_service(
    articles: List[Article] | None = None,
    total: int = 0,
    redis: FakeRedis | None = None,
    db_namespace: str = _TEST_DB_NAMESPACE,
) -> tuple[CatalogService, FakeArticleRepository, FakeCatalogRepository, FakeSession]:
    ar = FakeArticleRepository()
    cr = FakeCatalogRepository(articles=articles, total=total)
    sess = FakeSession()
    svc = CatalogService(
        article_repo=ar, catalog_repo=cr, session=cast(AsyncSession, sess), redis=redis, db_namespace=db_namespace
    )
    return svc, ar, cr, sess


# ================================================================ #
#  Тесты get_catalog_paginated — базовая пагинация                 #
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
    assert len(result.items) == 10
    call = cr.get_all_calls[0]
    assert call["limit"] == 10
    assert call["offset"] == 0


@pytest.mark.asyncio
async def test_get_catalog_paginated_page3_partial():
    # 25 статей, страница 3 size=10 → статьи 21–25 (5 шт.)
    all_articles = [_mk_article(i) for i in range(1, 26)]
    svc, _, cr, _ = _mk_service(articles=all_articles, total=25)

    result = await svc.get_catalog_paginated(page=3, size=10)

    assert len(result.items) == 5
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
async def test_get_catalog_paginated_passes_keyword_and_search():
    svc, _, cr, _ = _mk_service(articles=[], total=0)

    await svc.get_catalog_paginated(page=1, size=5, keyword="LLM", search="transformer")

    call = cr.get_all_calls[0]
    assert call["keyword"] == "LLM"
    assert call["search"] == "transformer"


# ================================================================ #
#  Тесты get_catalog_paginated — новые параметры фильтрации        #
# ================================================================ #


@pytest.mark.asyncio
async def test_get_catalog_paginated_passes_year_range():
    """year_from и year_to пробрасываются и в get_all, и в get_total_count."""
    svc, _, cr, _ = _mk_service(articles=[], total=0)

    await svc.get_catalog_paginated(page=1, size=10, year_from=2020, year_to=2024)

    assert cr.get_all_calls[0]["year_from"] == 2020
    assert cr.get_all_calls[0]["year_to"] == 2024
    assert cr.get_count_calls[0]["year_from"] == 2020
    assert cr.get_count_calls[0]["year_to"] == 2024


@pytest.mark.asyncio
async def test_get_catalog_paginated_passes_doc_types():
    """doc_types пробрасывается в оба вызова репозитория."""
    svc, _, cr, _ = _mk_service(articles=[], total=0)

    await svc.get_catalog_paginated(page=1, size=10, doc_types=["ar", "re"])

    assert cr.get_all_calls[0]["doc_types"] == ["ar", "re"]
    assert cr.get_count_calls[0]["doc_types"] == ["ar", "re"]


@pytest.mark.asyncio
async def test_get_catalog_paginated_passes_open_access_true():
    """open_access=True пробрасывается в оба вызова репозитория."""
    svc, _, cr, _ = _mk_service(articles=[], total=0)

    await svc.get_catalog_paginated(page=1, size=10, open_access=True)

    assert cr.get_all_calls[0]["open_access"] is True
    assert cr.get_count_calls[0]["open_access"] is True


@pytest.mark.asyncio
async def test_get_catalog_paginated_passes_countries():
    """countries пробрасывается в оба вызова репозитория."""
    svc, _, cr, _ = _mk_service(articles=[], total=0)

    await svc.get_catalog_paginated(page=1, size=10, countries=["Russia", "Germany"])

    assert cr.get_all_calls[0]["countries"] == ["Russia", "Germany"]
    assert cr.get_count_calls[0]["countries"] == ["Russia", "Germany"]


@pytest.mark.asyncio
async def test_get_catalog_paginated_all_filters_default_none():
    """Без передачи фильтров все новые параметры равны None — фильтрация не применяется."""
    svc, _, cr, _ = _mk_service(articles=[], total=0)

    await svc.get_catalog_paginated(page=1, size=10)

    call = cr.get_all_calls[0]
    assert call["year_from"] is None
    assert call["year_to"] is None
    assert call["doc_types"] is None
    assert call["open_access"] is None
    assert call["countries"] is None


@pytest.mark.asyncio
async def test_get_catalog_paginated_filters_consistent_in_all_and_count():
    """get_all и get_total_count получают идентичный набор фильтров."""
    svc, _, cr, _ = _mk_service(articles=[], total=5)
    await svc.get_catalog_paginated(
        page=1,
        size=10,
        year_from=2019,
        year_to=2023,
        doc_types=["ar"],
        open_access=False,
        countries=["China"],
    )

    # Оба вызова должны получить идентичные фильтры
    all_call = cr.get_all_calls[0]
    cnt_call = cr.get_count_calls[0]
    for key in ("year_from", "year_to", "doc_types", "open_access", "countries"):
        assert all_call[key] == cnt_call[key], f"Расхождение в поле {key!r}"


# ================================================================ #
#  Тесты get_catalog_paginated — кап точного COUNT (TOTAL_COUNT_CAP)#
# ================================================================ #


@pytest.mark.asyncio
async def test_get_catalog_paginated_passes_total_count_cap():
    """get_total_count получает CatalogService.TOTAL_COUNT_CAP, а не хардкод."""
    svc, _, cr, _ = _mk_service(articles=[], total=5)

    await svc.get_catalog_paginated(page=1, size=10)

    assert cr.get_count_calls[0]["cap"] == CatalogService.TOTAL_COUNT_CAP


@pytest.mark.asyncio
async def test_get_catalog_paginated_total_below_cap_not_capped():
    """total ниже кап — точное число, total_is_capped=False."""
    svc, _, cr, _ = _mk_service(articles=[], total=CatalogService.TOTAL_COUNT_CAP - 1)

    result = await svc.get_catalog_paginated(page=1, size=10)

    assert result.total == CatalogService.TOTAL_COUNT_CAP - 1
    assert result.total_is_capped is False


@pytest.mark.asyncio
async def test_get_catalog_paginated_total_above_cap_is_capped():
    """total выше кап — total == cap (не точное число), total_is_capped=True."""
    svc, _, cr, _ = _mk_service(articles=[], total=CatalogService.TOTAL_COUNT_CAP + 5000)

    result = await svc.get_catalog_paginated(page=1, size=10)

    assert result.total == CatalogService.TOTAL_COUNT_CAP
    assert result.total_is_capped is True


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
async def test_get_stats_maps_country_impact():
    svc, _, _, _ = _mk_service()

    result = await svc.get_stats()

    assert len(result.country_impact) == 1
    assert result.country_impact[0].country == "USA"
    assert result.country_impact[0].count == 30
    assert result.country_impact[0].mean_citations == 12.5


@pytest.mark.asyncio
async def test_get_stats_delegates_to_catalog_repo():
    svc, _, cr, _ = _mk_service()

    await svc.get_stats()

    # Ровно один вызов get_stats() в репозиторий
    assert cr.stats_call_count == 1


# ================================================================ #
#  Тесты get_journal_impact (Journal Landscape Scatter)             #
# ================================================================ #


@pytest.mark.asyncio
async def test_get_journal_impact_returns_journal_impact_points():
    svc, _, _, _ = _mk_service()

    result = await svc.get_journal_impact(max_year=2024)

    assert len(result) == 2
    assert all(isinstance(p, JournalImpactPoint) for p in result)
    assert result[0].journal == "Nature"
    assert result[0].count == 91
    assert result[0].mean_citations == 80.79
    assert result[0].median_citations == 52.0


@pytest.mark.asyncio
async def test_get_journal_impact_passes_max_year_to_repo():
    svc, _, cr, _ = _mk_service()

    await svc.get_journal_impact(max_year=2022)

    assert cr.journal_impact_calls == [2022]


# ================================================================ #
#  Тесты get_journal_impact — кэш Redis                             #
#  (max_year — слайдер на 3 значения, в отличие от get_pivot ниже)  #
# ================================================================ #


def _journal_impact_cache_json() -> str:
    """Валидный кэшированный payload — тот же формат, что и json.dumps([p.model_dump()...])."""
    return json.dumps([{"journal": "Cached Journal", "count": 1, "mean_citations": 1.0, "median_citations": 1.0}])


@pytest.mark.asyncio
async def test_get_journal_impact_uses_cache_on_hit():
    """Cache hit: Redis возвращает значение → DB не вызывается."""
    redis = FakeRedis(cached_value=_journal_impact_cache_json())
    svc, _, cr, _ = _mk_service(redis=redis)

    result = await svc.get_journal_impact(max_year=2024)

    assert cr.journal_impact_calls == [], "DB не должна вызываться при cache hit"
    assert redis.get_call_count == 1
    assert result == [
        JournalImpactPoint(journal="Cached Journal", count=1, mean_citations=1.0, median_citations=1.0)
    ]


@pytest.mark.asyncio
async def test_get_journal_impact_writes_cache_on_miss():
    """Cache miss: DB вызывается, результат записывается в Redis с правильным ключом и TTL."""
    redis = FakeRedis(cached_value=None)
    svc, _, cr, _ = _mk_service(redis=redis)

    result = await svc.get_journal_impact(max_year=2022)

    assert cr.journal_impact_calls == [2022], "При cache miss DB должна вызываться"
    assert len(redis.setex_calls) == 1, "После DB должна быть запись в Redis"

    key, ttl, value = redis.setex_calls[0]
    assert key == make_journal_impact_cache_key(2022, db_namespace=_TEST_DB_NAMESPACE)
    assert ttl == STATS_CACHE_TTL
    assert json.loads(value)[0]["journal"] == "Nature"
    assert result[0].journal == "Nature"


@pytest.mark.asyncio
async def test_get_journal_impact_different_max_year_different_cache_key():
    """Разные значения слайдера (2022/2023/2024) не должны делить один ключ кэша."""
    redis = FakeRedis(cached_value=None)
    svc, _, _, _ = _mk_service(redis=redis)

    await svc.get_journal_impact(max_year=2022)
    await svc.get_journal_impact(max_year=2024)

    key_2022, _, _ = redis.setex_calls[0]
    key_2024, _, _ = redis.setex_calls[1]
    assert key_2022 != key_2024


@pytest.mark.asyncio
async def test_get_journal_impact_different_db_namespace_different_cache_key():
    """prod/staging, делящие один физический Redis, не должны делить ключ (см. get_stats)."""
    redis_a = FakeRedis(cached_value=None)
    redis_b = FakeRedis(cached_value=None)
    svc_a, _, _, _ = _mk_service(redis=redis_a, db_namespace="postgresql://prod-host/db")
    svc_b, _, _, _ = _mk_service(redis=redis_b, db_namespace="postgresql://staging-host/db")

    await svc_a.get_journal_impact(max_year=2024)
    await svc_b.get_journal_impact(max_year=2024)

    key_a, _, _ = redis_a.setex_calls[0]
    key_b, _, _ = redis_b.setex_calls[0]
    assert key_a != key_b


@pytest.mark.asyncio
async def test_get_journal_impact_degrades_on_redis_error():
    """Redis GET бросает исключение → graceful degradation: DB вызывается, результат корректен."""
    redis = FakeRedis(raise_on_get=True)
    svc, _, cr, _ = _mk_service(redis=redis)

    result = await svc.get_journal_impact(max_year=2024)

    assert cr.journal_impact_calls == [2024], "При ошибке Redis должен быть fallback на DB"
    assert result[0].journal == "Nature"


@pytest.mark.asyncio
async def test_get_journal_impact_skips_setex_on_redis_error():
    """Redis SETEX бросает исключение → результат всё равно возвращается корректно."""
    redis = FakeRedis(cached_value=None, raise_on_setex=True)
    svc, _, cr, _ = _mk_service(redis=redis)

    result = await svc.get_journal_impact(max_year=2024)

    assert cr.journal_impact_calls == [2024]
    assert len(redis.setex_calls) == 0
    assert result[0].journal == "Nature"


@pytest.mark.asyncio
async def test_get_journal_impact_no_redis_goes_directly_to_db():
    """redis=None → прямой вызов DB без попыток Redis."""
    svc, _, cr, _ = _mk_service(redis=None)

    result = await svc.get_journal_impact(max_year=2024)

    assert cr.journal_impact_calls == [2024]
    assert result[0].journal == "Nature"


# ================================================================ #
#  Тесты get_pivot (Table Builder)                                  #
# ================================================================ #


@pytest.mark.asyncio
async def test_get_pivot_returns_pivot_response():
    svc, _, _, _ = _mk_service()

    result = await svc.get_pivot(row_dim="year", col_dim="country", top_n_rows=20, top_n_cols=15)

    assert isinstance(result, PivotResponse)
    assert result.row_dim == "year"
    assert result.col_dim == "country"
    assert result.metric == "count"
    assert result.row_labels == ["2023", "2024"]
    assert result.matrix == [[10, 5], [20, 8]]


@pytest.mark.asyncio
async def test_get_pivot_passes_all_params_to_repo():
    svc, _, cr, _ = _mk_service()

    await svc.get_pivot(
        row_dim="doc_type",
        col_dim="open_access",
        top_n_rows=10,
        top_n_cols=5,
        filter_dim="year",
        filter_value="2024",
        metric="avg_citations",
    )

    assert cr.pivot_calls == [
        {
            "row_dim": "doc_type",
            "col_dim": "open_access",
            "top_n_rows": 10,
            "top_n_cols": 5,
            "filter_dim": "year",
            "filter_value": "2024",
            "metric": "avg_citations",
        }
    ]


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

        async def delete_orphaned(self) -> int:
            return 0

    cr = FakeCatalogRepository()
    sess = FakeSession()
    svc = CatalogService(article_repo=BrokenArticleRepo(), catalog_repo=cr, session=cast(AsyncSession, sess))

    with pytest.raises(RuntimeError, match="db down"):
        await svc.seed(articles=[_mk_article(1)], keyword="AI")

    assert cr.save_seeded_calls == []
    assert sess.commit_call_count == 0


# ================================================================ #
#  Тесты get_stats — кэш Redis (П-1-Т)                            #
# ================================================================ #


@pytest.mark.asyncio
async def test_get_stats_uses_cache_on_hit():
    """Cache hit: Redis возвращает значение → DB не вызывается."""
    cached = _minimal_stats_response().model_dump_json()
    redis = FakeRedis(cached_value=cached)
    svc, _, cr, _ = _mk_service(redis=redis)

    result = await svc.get_stats()

    assert cr.stats_call_count == 0, "DB не должна вызываться при cache hit"
    assert redis.get_call_count == 1
    assert result.total_articles == 42


@pytest.mark.asyncio
async def test_get_stats_writes_cache_on_miss():
    """Cache miss: DB вызывается, результат записывается в Redis с правильным ключом и TTL."""
    redis = FakeRedis(cached_value=None)
    svc, _, cr, _ = _mk_service(redis=redis)

    result = await svc.get_stats(countries=["USA"])

    assert cr.stats_call_count == 1, "При cache miss DB должна вызываться"
    assert len(redis.setex_calls) == 1, "После DB должна быть запись в Redis"

    key, ttl, value = redis.setex_calls[0]
    expected_key = make_stats_cache_key(["USA"], None, None, None, None, db_namespace=_TEST_DB_NAMESPACE)
    assert key == expected_key
    assert ttl == STATS_CACHE_TTL
    assert result.total_articles == 42


@pytest.mark.asyncio
async def test_get_stats_different_db_namespace_different_cache_key():
    """Два сервиса с разным db_namespace (например, prod vs staging, делящие один
    физический Redis) пишут статистику под РАЗНЫМИ ключами — без этого один
    из них перезаписал бы кэш другого (см. redis_client.make_stats_cache_key)."""
    redis_a = FakeRedis(cached_value=None)
    redis_b = FakeRedis(cached_value=None)
    svc_a, _, _, _ = _mk_service(redis=redis_a, db_namespace="postgresql://prod-host/db")
    svc_b, _, _, _ = _mk_service(redis=redis_b, db_namespace="postgresql://staging-host/db")

    await svc_a.get_stats()
    await svc_b.get_stats()

    key_a, _, _ = redis_a.setex_calls[0]
    key_b, _, _ = redis_b.setex_calls[0]
    assert key_a != key_b


@pytest.mark.asyncio
async def test_get_stats_degrades_on_redis_error():
    """Redis GET бросает исключение → graceful degradation: DB вызывается, результат корректен."""
    redis = FakeRedis(raise_on_get=True)
    svc, _, cr, _ = _mk_service(redis=redis)

    result = await svc.get_stats()

    assert cr.stats_call_count == 1, "При ошибке Redis должен быть fallback на DB"
    assert isinstance(result, StatsResponse)
    assert result.total_articles == 42


@pytest.mark.asyncio
async def test_get_stats_skips_setex_on_redis_error():
    """Redis SETEX бросает исключение → результат всё равно возвращается корректно."""
    redis = FakeRedis(cached_value=None, raise_on_setex=True)
    svc, _, cr, _ = _mk_service(redis=redis)

    result = await svc.get_stats()

    assert cr.stats_call_count == 1
    assert len(redis.setex_calls) == 0
    assert result.total_articles == 42


@pytest.mark.asyncio
async def test_get_stats_no_redis_goes_directly_to_db():
    """redis=None → прямой вызов DB без попыток Redis."""
    svc, _, cr, _ = _mk_service(redis=None)

    result = await svc.get_stats()

    assert cr.stats_call_count == 1
    assert isinstance(result, StatsResponse)
