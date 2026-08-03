# openalex_pdf_feed/tests/test_openalex_client.py
from datetime import date

import httpx
import pytest

from openalex_pdf_feed.openalex_client import (
    OpenAlexClient,
    OpenAlexError,
    build_filter,
    work_short_id,
)


class TestBuildFilter:
    def test_quotes_exact_phrase(self):
        # Регрессия на баг: без кавычек title_and_abstract.search делает
        # нестрогий стемминг-матч (проверено live: "existential analysis" без
        # кавычек = 18271 результат, с кавычками = 433 — см. спеку §1)
        f = build_filter("existential analysis", None)
        assert 'title_and_abstract.search:"existential analysis"' in f

    def test_always_includes_oa_and_has_content(self):
        f = build_filter("logotherapy", None)
        assert "open_access.is_oa:true" in f
        assert "has_content.pdf:true" in f

    def test_restricts_to_article_and_review_types(self):
        # Фильтр type:article|review заодно отсекает препринты: у OpenAlex
        # "preprint" отдельное, взаимоисключающее значение того же поля type
        # (не version), проверено live (пересечение type:article|review и
        # значения preprint даёт 0 результатов).
        f = build_filter("logotherapy", None)
        assert "type:article|review" in f

    def test_restricts_to_en_ru_fr_languages(self):
        f = build_filter("logotherapy", None)
        assert "language:en|ru|fr" in f

    def test_excludes_retracted_works(self):
        # Регрессия: is_retracted:!true — невалидный синтаксис для boolean-поля,
        # OpenAlex API отвечает 400 ("Value for is_retracted must be true,
        # false null, or !null: not !true") — проверено live. Корректно false.
        f = build_filter("logotherapy", None)
        assert "is_retracted:false" in f
        assert "is_retracted:!true" not in f

    def test_no_citation_or_date_range_threshold_by_default(self):
        # По решению пользователя 2026-08-03 — порог cited_by_count и
        # произвольный диапазон дат публикации (сверх курсора) не выставляются.
        f = build_filter("logotherapy", None)
        assert "cited_by_count" not in f

    def test_since_appends_from_publication_date(self):
        f = build_filter("logotherapy", date(2026, 7, 1))
        assert "from_publication_date:2026-07-01" in f

    def test_no_since_omits_date_filter(self):
        f = build_filter("logotherapy", None)
        assert "from_publication_date" not in f

    def test_require_content_pdf_false_omits_has_content(self):
        # Используется только OpenAlexClient.count() для метрики "сколько
        # совпадений без кэша PDF" — сама discover() всегда require_content_pdf=True
        f = build_filter("logotherapy", None, require_content_pdf=False)
        assert "has_content.pdf:true" not in f
        assert "open_access.is_oa:true" in f


class TestWorkShortId:
    def test_strips_url_prefix(self):
        assert work_short_id({"id": "https://openalex.org/W2741809807"}) == "W2741809807"


class TestHasBudget:
    def _client(self) -> OpenAlexClient:
        # Обходим __init__, который требует httpx.AsyncClient — не нужен для
        # проверки чистой логики has_budget (по образцу test_scopus_client.py)
        return OpenAlexClient.__new__(OpenAlexClient)

    def test_unknown_budget_allows_continuing(self):
        client = self._client()
        client._last_remaining_usd = None
        assert client.has_budget(0.01) is True

    def test_insufficient_budget_blocks(self):
        client = self._client()
        client._last_remaining_usd = 0.005
        assert client.has_budget(0.01) is False

    def test_sufficient_budget_allows(self):
        client = self._client()
        client._last_remaining_usd = 0.02
        assert client.has_budget(0.01) is True


@pytest.mark.asyncio
async def test_discover_paginates_via_cursor(monkeypatch):
    pages = [
        {"results": [{"id": "https://openalex.org/W1"}], "meta": {"next_cursor": "abc"}},
        {"results": [{"id": "https://openalex.org/W2"}], "meta": {"next_cursor": None}},
    ]

    class MockResponse:
        def __init__(self, body):
            self.status_code = 200
            self.headers = {"x-ratelimit-remaining-usd": "0.5"}
            self._body = body

        def json(self):
            return self._body

    async def mock_get(*args, **kwargs):
        return MockResponse(pages.pop(0))

    monkeypatch.setattr(httpx.AsyncClient, "get", mock_get)

    async with httpx.AsyncClient() as http_client:
        client = OpenAlexClient(http_client, api_key="test-key")
        results = [w async for w in client.discover("logotherapy")]

    assert [w["id"] for w in results] == [
        "https://openalex.org/W1",
        "https://openalex.org/W2",
    ]
    assert client.last_remaining_usd == 0.5


@pytest.mark.asyncio
async def test_discover_raises_on_non_200(monkeypatch):
    class MockResponse:
        status_code = 500
        headers: dict = {}
        text = "server error"

    async def mock_get(*args, **kwargs):
        return MockResponse()

    monkeypatch.setattr(httpx.AsyncClient, "get", mock_get)

    async with httpx.AsyncClient() as http_client:
        client = OpenAlexClient(http_client, api_key="test-key")
        with pytest.raises(OpenAlexError):
            async for _ in client.discover("logotherapy"):
                pass


@pytest.mark.asyncio
async def test_count_returns_meta_count(monkeypatch):
    class MockResponse:
        status_code = 200
        headers = {"x-ratelimit-remaining-usd": "0.5"}

        def json(self):
            return {"meta": {"count": 72}}

    async def mock_get(*args, **kwargs):
        return MockResponse()

    monkeypatch.setattr(httpx.AsyncClient, "get", mock_get)

    async with httpx.AsyncClient() as http_client:
        client = OpenAlexClient(http_client, api_key="test-key")
        total = await client.count("anthropology of technology", None, require_content_pdf=False)

    assert total == 72


@pytest.mark.asyncio
async def test_count_raises_on_non_200(monkeypatch):
    class MockResponse:
        status_code = 500
        headers: dict = {}
        text = "server error"

    async def mock_get(*args, **kwargs):
        return MockResponse()

    monkeypatch.setattr(httpx.AsyncClient, "get", mock_get)

    async with httpx.AsyncClient() as http_client:
        client = OpenAlexClient(http_client, api_key="test-key")
        with pytest.raises(OpenAlexError):
            await client.count("logotherapy", None, require_content_pdf=True)


@pytest.mark.asyncio
async def test_download_content_returns_bytes(monkeypatch):
    class MockResponse:
        status_code = 200
        headers = {"x-ratelimit-remaining-usd": "0.42"}
        content = b"%PDF-1.4 fake content"

    async def mock_get(*args, **kwargs):
        return MockResponse()

    monkeypatch.setattr(httpx.AsyncClient, "get", mock_get)

    async with httpx.AsyncClient() as http_client:
        client = OpenAlexClient(http_client, api_key="test-key")
        content = await client.download_content("W2741809807")

    assert content == b"%PDF-1.4 fake content"
    assert client.last_remaining_usd == 0.42


@pytest.mark.asyncio
async def test_download_content_raises_on_non_200(monkeypatch):
    class MockResponse:
        status_code = 404
        headers: dict = {}
        text = "not found"

    async def mock_get(*args, **kwargs):
        return MockResponse()

    monkeypatch.setattr(httpx.AsyncClient, "get", mock_get)

    async with httpx.AsyncClient() as http_client:
        client = OpenAlexClient(http_client, api_key="test-key")
        with pytest.raises(OpenAlexError):
            await client.download_content("W2741809807")
