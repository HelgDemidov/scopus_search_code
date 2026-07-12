"""Интеграционные тесты POST /articles/stats/pivot/nl-query (SQLite, без requires_pg).

docs/ai-nl-pivot/spec.md §3. LLM-парсер подменяется фейком через DI-override
(как _NoOpEmailService в tests/integration/test_password_reset.py) — реальный
HTTP-вызов к OpenRouter в тестах не происходит. Rate-limit (Redis) — отдельный
модуль (app/core/nl_pivot_rate_limit.py), не FastAPI Depends, поэтому
управляется monkeypatch'ем redis_client в этом модуле напрямую.
"""

from contextlib import contextmanager

import pytest
from httpx import AsyncClient

from app.config import settings
from app.core import nl_pivot_rate_limit as rl_module
from app.core.dependencies import get_nl_pivot_parser
from app.interfaces.nl_pivot_parser import INlPivotParser, NlPivotParseError
from app.main import app
from app.schemas.article_schemas import PivotGroundingContext


class _FakeRedis:
    """Тот же принцип, что FakeRedis в test_nl_pivot_rate_limit.py — всегда
    пропускает (маленькие счётчики, лимиты из Settings по умолчанию щедрые)."""

    def __init__(self) -> None:
        self.counters: dict[str, int] = {}

    async def incr_with_ttl(self, key: str, ttl_seconds: int) -> int:
        self.counters[key] = self.counters.get(key, 0) + 1
        return self.counters[key]


class _FakeNlPivotParser(INlPivotParser):
    def __init__(self, response: dict | None = None, error: Exception | None = None):
        self._response = response
        self._error = error

    async def parse(self, query: str, grounding: PivotGroundingContext) -> dict:
        if self._error is not None:
            raise self._error
        assert self._response is not None
        return self._response


@pytest.fixture(autouse=True)
def _permissive_redis(monkeypatch: pytest.MonkeyPatch):
    # По умолчанию rate-limit пропускает все запросы — тесты, проверяющие 429/503,
    # переопределяют это явно.
    monkeypatch.setattr(rl_module, "redis_client", _FakeRedis())
    yield


@contextmanager
def _override_parser(fake: _FakeNlPivotParser):
    app.dependency_overrides[get_nl_pivot_parser] = lambda: fake
    try:
        yield
    finally:
        app.dependency_overrides.pop(get_nl_pivot_parser, None)


# ---------------------------------------------------------------------------
# 5 типовых формулировок → 200
# ---------------------------------------------------------------------------

_TYPICAL_FORMULATIONS = [
    (
        "публикации по годам и странам",
        {
            "row_dim": "year",
            "col_dim": "country",
            "filter_dim": None,
            "filter_value": None,
            "metric": "count",
            "error": None,
        },
    ),
    (
        "average citations by document type and open access status",
        {
            "row_dim": "doc_type",
            "col_dim": "open_access",
            "filter_dim": None,
            "filter_value": None,
            "metric": "avg_citations",
            "error": None,
        },
    ),
    (
        "top journals in China, articles only",
        {
            "row_dim": "journal",
            "col_dim": "country",
            "filter_dim": "doc_type",
            "filter_value": "Article",
            "metric": "count",
            "error": None,
        },
    ),
    (
        "articles per year",  # 1D-намерение — фейк симулирует эвристику из промпта (§2)
        {
            "row_dim": "year",
            "col_dim": "doc_type",
            "filter_dim": None,
            "filter_value": None,
            "metric": "count",
            "error": None,
        },
    ),
    (
        "publikacije po tipu dokumenta i pristupu (sr-Latn/ru формулировка)",
        {
            "row_dim": "doc_type",
            "col_dim": "open_access",
            "filter_dim": None,
            "filter_value": None,
            "metric": "count",
            "error": None,
        },
    ),
]


@pytest.mark.asyncio
@pytest.mark.parametrize("query,canned_response", _TYPICAL_FORMULATIONS)
async def test_typical_formulations_return_valid_pivot_params(
    authenticated_client: AsyncClient,
    query: str,
    canned_response: dict,
):
    fake = _FakeNlPivotParser(response=canned_response)
    with _override_parser(fake):
        resp = await authenticated_client.post("/articles/stats/pivot/nl-query", json={"query": query})

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["row_dim"] == canned_response["row_dim"]
    assert body["col_dim"] == canned_response["col_dim"]
    assert body["metric"] == canned_response["metric"]
    assert body["filter_dim"] == canned_response["filter_dim"]
    assert body["filter_value"] == canned_response["filter_value"]


# ---------------------------------------------------------------------------
# Невалидный/неоднозначный запрос → 400 (не эхо LLM-сообщения, см. §2)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_ambiguous_query_returns_400_not_llm_text(authenticated_client: AsyncClient):
    fake = _FakeNlPivotParser(error=NlPivotParseError("SECRET_INTERNAL_DETAIL_should_not_leak"))
    with _override_parser(fake):
        resp = await authenticated_client.post(
            "/articles/stats/pivot/nl-query", json={"query": "what's the weather like today"}
        )

    assert resp.status_code == 400
    assert "SECRET_INTERNAL_DETAIL_should_not_leak" not in resp.text


@pytest.mark.asyncio
async def test_filter_dim_colliding_with_col_dim_returns_400(authenticated_client: AsyncClient):
    """Регрессия на реальный прод-баг (2026-07-12, bug-fix раунд п.3, spec.md):
    LLM иногда дублирует названную сущность как filter_dim И col_dim одновременно
    (найдено живым тестом на "статьи из Китая по годам"). Промпт исправлен (§2),
    но валидация — последняя линия защиты, если модель всё же так ответит."""
    fake = _FakeNlPivotParser(
        response={
            "row_dim": "year",
            "col_dim": "country",
            "filter_dim": "country",
            "filter_value": "China",
            "metric": "count",
            "error": None,
        }
    )
    with _override_parser(fake):
        resp = await authenticated_client.post(
            "/articles/stats/pivot/nl-query", json={"query": "статьи из Китая по годам"}
        )

    assert resp.status_code == 400


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_requires_jwt(client: AsyncClient):
    resp = await client.post("/articles/stats/pivot/nl-query", json={"query": "articles per year"})
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Rate limit
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_user_rate_limit_exceeded_returns_429(
    authenticated_client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.setattr(settings, "NL_PIVOT_USER_DAILY_LIMIT", 0)
    fake = _FakeNlPivotParser(
        response={
            "row_dim": "year",
            "col_dim": "country",
            "filter_dim": None,
            "filter_value": None,
            "metric": "count",
            "error": None,
        }
    )
    with _override_parser(fake):
        resp = await authenticated_client.post("/articles/stats/pivot/nl-query", json={"query": "anything"})

    assert resp.status_code == 429


@pytest.mark.asyncio
async def test_global_rate_limit_exceeded_returns_429(
    authenticated_client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.setattr(settings, "NL_PIVOT_GLOBAL_DAILY_LIMIT", 0)
    fake = _FakeNlPivotParser(
        response={
            "row_dim": "year",
            "col_dim": "country",
            "filter_dim": None,
            "filter_value": None,
            "metric": "count",
            "error": None,
        }
    )
    with _override_parser(fake):
        resp = await authenticated_client.post("/articles/stats/pivot/nl-query", json={"query": "anything"})

    assert resp.status_code == 429


@pytest.mark.asyncio
async def test_redis_unavailable_returns_503(
    authenticated_client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.setattr(rl_module, "redis_client", None)

    resp = await authenticated_client.post("/articles/stats/pivot/nl-query", json={"query": "anything"})

    assert resp.status_code == 503
