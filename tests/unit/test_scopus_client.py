import httpx
import pytest

from app.infrastructure.scopus_client import ScopusHTTPClient


@pytest.mark.asyncio
async def test_scopus_client_search_and_limits(monkeypatch):
    # Arrange: мокаем ответ httpx с заголовками rate-limit и телом,
    # соответствующим реальной структуре STANDARD-view Scopus Search API
    class MockResponse:
        def __init__(self):
            self.status_code = 200
            self.headers = {
                "X-RateLimit-Limit": "20000",
                "X-RateLimit-Remaining": "19884",
                "X-RateLimit-Reset": "1774695787",
            }

        def json(self):
            return {
                "search-results": {
                    "entry": [
                        {
                            # Название статьи
                            "dc:title": "Test Article",
                            # Название журнала
                            "prism:publicationName": "Journal of Testing",
                            # Первый автор
                            "dc:creator": "John Doe",
                            # Дата публикации
                            "prism:coverDate": "2026-03-25",
                            # DOI
                            "prism:doi": "10.1234/test",
                            # Число цитирований (приходит строкой)
                            "citedby-count": "42",
                            # Тип документа
                            "subtypeDescription": "Article",
                            # Открытый доступ (приходит строкой "0" / "1")
                            "openaccess": "1",
                            # Аффилиация (вложенный объект)
                            "affiliation": {"affiliation-country": "United States"},
                        }
                    ]
                }
            }

        def raise_for_status(self):
            pass

    async def mock_get(*args, **kwargs):
        return MockResponse()

    monkeypatch.setattr("httpx.AsyncClient.get", mock_get)

    # Act
    async with httpx.AsyncClient() as http_client:
        client = ScopusHTTPClient(http_client)
        articles = await client.search("machine learning", count=1)

        # Assert: проверяем корректное извлечение всех полей STANDARD-view
        assert len(articles) == 1
        assert articles[0].title == "Test Article"
        assert articles[0].author == "John Doe"
        assert articles[0].journal == "Journal of Testing"
        assert str(articles[0].publication_date) == "2026-03-25"
        assert articles[0].doi == "10.1234/test"
        assert articles[0].cited_by_count == 42
        assert articles[0].open_access is True
        assert articles[0].affiliation_country == "United States"

        # Assert: проверяем сохранение rate-limit лимитов из заголовков
        assert client.last_rate_limit == "20000"
        assert client.last_rate_remaining == "19884"
        assert client.last_rate_reset == "1774695787"


# ================================================================ #
#  TestBuildQuery: юнит-тесты CQL-построителя                          #
#  Не требуют HTTP, asyncio или БД. Запускаются мгновенно.         #
# ================================================================ #


class TestBuildQuery:
    def _client(self) -> ScopusHTTPClient:
        # Обходим __init__, который требует httpx.AsyncClient.
        # build_query не использует self._client (только self), поэтому это безопасно
        return ScopusHTTPClient.__new__(ScopusHTTPClient)

    def test_no_filters_returns_base_clause(self):
        assert self._client().build_query("AI", None) == "TITLE-ABS-KEY(AI)"

    def test_empty_filters_dict_returns_base_clause(self):
        # Пустой словарь эквивалентен None — нет дополнительных клауз
        assert self._client().build_query("AI", {}) == "TITLE-ABS-KEY(AI)"

    def test_year_from_appends_pubyear_gt(self):
        q = self._client().build_query("AI", {"year_from": 2020})
        # Scopus использует строгое неравенство, поэтому year_from=2020 → PUBYEAR > 2019
        assert "PUBYEAR > 2019" in q
        assert q.startswith("TITLE-ABS-KEY(AI)")

    def test_year_to_appends_pubyear_lt(self):
        q = self._client().build_query("AI", {"year_to": 2024})
        # year_to=2024 → PUBYEAR < 2025
        assert "PUBYEAR < 2025" in q

    def test_single_doc_type_article(self):
        q = self._client().build_query("AI", {"document_types": ["Article"]})
        assert "DOCTYPE(ar)" in q

    def test_multiple_doc_types_joined_with_or(self):
        q = self._client().build_query("AI", {"document_types": ["Article", "Review"]})
        assert "DOCTYPE(ar)" in q
        assert "DOCTYPE(re)" in q
        # Несколько типов объединяются через OR внутри скобок
        assert "DOCTYPE(ar) OR DOCTYPE(re)" in q

    def test_unknown_doc_type_is_silently_skipped(self):
        # Неизвестный тип пропускается силентно, без DOCTYPE-клаузы
        q = self._client().build_query("AI", {"document_types": ["UnknownType"]})
        assert "DOCTYPE" not in q

    def test_open_access_true_appends_openaccess1(self):
        q = self._client().build_query("AI", {"open_access": True})
        assert "OPENACCESS(1)" in q

    def test_open_access_false_appends_not_openaccess1(self):
        # open_access=False → NOT OPENACCESS(1) (только закрытые статьи)
        q = self._client().build_query("AI", {"open_access": False})
        assert "NOT OPENACCESS(1)" in q
        # Убеждаемся, что голый OPENACCESS(1) без NOT не добавлен
        assert "AND OPENACCESS(1)" not in q

    def test_single_country(self):
        q = self._client().build_query("AI", {"countries": ["Germany"]})
        assert "AFFILCOUNTRY(Germany)" in q

    def test_multiple_countries_joined_with_or(self):
        q = self._client().build_query("AI", {"countries": ["Germany", "France"]})
        # Несколько стран объединяются через OR
        assert "AFFILCOUNTRY(Germany) OR AFFILCOUNTRY(France)" in q

    def test_all_filters_combined_base_clause_is_first(self):
        q = self._client().build_query(
            "AI",
            {
                "year_from": 2020,
                "year_to": 2024,
                "document_types": ["Article"],
                "open_access": True,
                "countries": ["USA"],
            },
        )
        # Базовая клауза всегда первая, остальные через AND
        assert q.startswith("TITLE-ABS-KEY(AI)")
        assert " AND " in q
        assert "PUBYEAR > 2019" in q
        assert "PUBYEAR < 2025" in q
        assert "DOCTYPE(ar)" in q
        assert "OPENACCESS(1)" in q


# ================================================================ #
#  Тесты параметра start (пагинация)                               #
# ================================================================ #


def _make_empty_scopus_response():
    class R:
        status_code = 200
        headers = {
            "X-RateLimit-Limit": "20000",
            "X-RateLimit-Remaining": "19000",
            "X-RateLimit-Reset": "0",
        }

        def json(self):
            return {"search-results": {"entry": []}}

        def raise_for_status(self):
            pass

    return R()


@pytest.mark.asyncio
async def test_search_default_start_is_zero(monkeypatch):
    """start=0 по умолчанию передаётся в Scopus API params."""
    captured: dict = {}

    async def mock_get(self, url, *, params=None, **kw):
        captured.update(params or {})
        return _make_empty_scopus_response()

    monkeypatch.setattr(httpx.AsyncClient, "get", mock_get)
    async with httpx.AsyncClient() as http_client:
        await ScopusHTTPClient(http_client).search("neural network")

    assert captured.get("start") == 0


@pytest.mark.asyncio
async def test_search_passes_start_offset_to_scopus(monkeypatch):
    """Явный start=50 пробрасывается в Scopus API params без изменений."""
    captured: dict = {}

    async def mock_get(self, url, *, params=None, **kw):
        captured.update(params or {})
        return _make_empty_scopus_response()

    monkeypatch.setattr(httpx.AsyncClient, "get", mock_get)
    async with httpx.AsyncClient() as http_client:
        await ScopusHTTPClient(http_client).search("neural network", start=50)

    assert captured.get("start") == 50
