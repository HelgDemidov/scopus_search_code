import pytest
import httpx
from app.infrastructure.scopus_client import ScopusHTTPClient


@pytest.mark.asyncio
async def test_scopus_client_search_and_limits(monkeypatch):
    # Arrange: мокаем ответ httpx с заголовками rate-limit и телом,
    # соответствующим реальной структуре COMPLETE-view Scopus Search API
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
                            # Название статьи — dc:title (не prism:publicationName)
                            "dc:title": "Test Article",
                            # Название журнала (отдельное поле)
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
                            # Ключевые слова авторов
                            "authkeywords": "machine learning | deep learning",
                            # Аффилиация (вложенный объект)
                            "affiliation": {
                                "affiliation-country": "United States"
                            },
                            # Спонсор финансирования
                            "fund-sponsor": "NSF",
                            # Аннотация
                            "dc:description": "A test abstract.",
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

        # Assert: проверяем корректное извлечение полей из dc:title и dc:creator
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
