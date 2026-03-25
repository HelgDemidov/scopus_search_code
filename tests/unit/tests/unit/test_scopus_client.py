import pytest
import httpx
from app.infrastructure.scopus_client import ScopusHTTPClient

@pytest.mark.asyncio
async def test_scopus_client_search_and_limits(monkeypatch):
    # Arrange: мокаем ответ httpx с нужными заголовками и телом
    class MockResponse:
        def __init__(self):
            self.status_code = 200
            self.headers = {
                "X-RateLimit-Limit": "20000",
                "X-RateLimit-Remaining": "19884",
                "X-RateLimit-Reset": "1774695787"
            }
        
        def json(self):
            return {
                "search-results": {
                    "entry": [
                        {
                            "prism:publicationName": "Test Article",
                            "dc:creator": "John Doe",
                            "prism:coverDate": "2026-03-25",
                            "prism:doi": "10.1234/test"
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
        
        # Assert: проверяем статьи
        assert len(articles) == 1
        assert articles[0].title == "Test Article"
        assert articles[0].author == "John Doe"
        
        # Assert: проверяем сохранение лимитов
        assert client.last_rate_limit == "20000"
        assert client.last_rate_remaining == "19884"
        assert client.last_rate_reset == "1774695787"
