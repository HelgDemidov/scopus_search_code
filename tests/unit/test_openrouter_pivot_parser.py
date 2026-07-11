"""Юнит-тесты OpenRouterPivotParser (docs/ai-nl-pivot/spec.md §2).

Мокаем httpx.AsyncClient.post на уровне класса — тот же паттерн, что
tests/unit/test_scopus_client.py.
"""

import httpx
import pytest

from app.infrastructure.openrouter_pivot_parser import OpenRouterPivotParser
from app.interfaces.nl_pivot_parser import NlPivotParseError
from app.schemas.article_schemas import PivotGroundingContext


def _grounding() -> PivotGroundingContext:
    return PivotGroundingContext(
        countries=["United States", "China", "India"],
        doc_types=["Article", "Conference Paper"],
        years=[2022, 2023, 2024],
    )


class _MockResponse:
    def __init__(self, status_code: int, content: str):
        self.status_code = status_code
        self._content = content
        self.text = content

    def json(self):
        return {"choices": [{"message": {"content": self._content}}]}


def _mock_post(content: str, status_code: int = 200):
    async def _post(*args, **kwargs):
        return _MockResponse(status_code, content)

    return _post


@pytest.mark.asyncio
async def test_parses_valid_structured_json(monkeypatch: pytest.MonkeyPatch):
    body = (
        '{"row_dim": "year", "col_dim": "country", "filter_dim": null, '
        '"filter_value": null, "metric": "count", "error": null}'
    )
    monkeypatch.setattr(httpx.AsyncClient, "post", _mock_post(body))

    result = await OpenRouterPivotParser().parse("articles per year by country", _grounding())

    assert result["row_dim"] == "year"
    assert result["col_dim"] == "country"


@pytest.mark.asyncio
async def test_repairs_json_wrapped_in_markdown_fence(monkeypatch: pytest.MonkeyPatch):
    body = (
        '```json\n{"row_dim": "doc_type", "col_dim": "open_access", "filter_dim": null, '
        '"filter_value": null, "metric": "avg_citations", "error": null}\n```'
    )
    monkeypatch.setattr(httpx.AsyncClient, "post", _mock_post(body))

    result = await OpenRouterPivotParser().parse("average citations by doc type and OA status", _grounding())

    assert result["row_dim"] == "doc_type"
    assert result["metric"] == "avg_citations"


@pytest.mark.asyncio
async def test_explicit_error_field_raises_parse_error(monkeypatch: pytest.MonkeyPatch):
    body = (
        '{"row_dim": null, "col_dim": null, "filter_dim": null, "filter_value": null, '
        '"metric": null, "error": "not an analytics question"}'
    )
    monkeypatch.setattr(httpx.AsyncClient, "post", _mock_post(body))

    with pytest.raises(NlPivotParseError):
        await OpenRouterPivotParser().parse("what's the weather like", _grounding())


@pytest.mark.asyncio
async def test_unparseable_garbage_raises_parse_error(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(httpx.AsyncClient, "post", _mock_post("not json at all, no braces either"))

    with pytest.raises(NlPivotParseError):
        await OpenRouterPivotParser().parse("anything", _grounding())


@pytest.mark.asyncio
async def test_non_200_status_raises_parse_error(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(httpx.AsyncClient, "post", _mock_post("Internal Server Error", status_code=500))

    with pytest.raises(NlPivotParseError):
        await OpenRouterPivotParser().parse("anything", _grounding())


@pytest.mark.asyncio
async def test_connection_error_raises_parse_error(monkeypatch: pytest.MonkeyPatch):
    async def _raise_post(*args, **kwargs):
        raise httpx.ConnectError("connection refused")

    monkeypatch.setattr(httpx.AsyncClient, "post", _raise_post)

    with pytest.raises(NlPivotParseError):
        await OpenRouterPivotParser().parse("anything", _grounding())
