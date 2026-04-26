import pytest
from httpx import AsyncClient
from app.main import app
from app.core.dependencies import get_scopus_client
from app.services.search_service import SearchService
from app.interfaces.search_client import ISearchClient


# FakeScopusClient реализует ISearchClient — проходит isinstance-guard в роутере.
# Backing fields + @property идентичны паттерну ScopusHTTPClient:
# Python видит @property в __dict__ класса и убирает имена из __abstractmethods__,
# что позволяет создать экземпляр без TypeError.
class FakeScopusClient(ISearchClient):
    def __init__(self):
        self._last_rate_limit = "20000"
        self._last_rate_remaining = "19884"
        self._last_rate_reset = "1774695787"

    @property
    def last_rate_limit(self) -> str | None:
        return self._last_rate_limit

    @property
    def last_rate_remaining(self) -> str | None:
        return self._last_rate_remaining

    @property
    def last_rate_reset(self) -> str | None:
        return self._last_rate_reset

    async def search(self, keyword: str, count: int = 25) -> list:
        # Тест проверяет заголовки, а не результаты поиска
        return []


async def override_get_scopus_client():
    yield FakeScopusClient()


@pytest.mark.asyncio
async def test_find_articles_rate_limits_headers(authenticated_client: AsyncClient, monkeypatch):
    # Переопределяем зависимость клиента для роутера
    app.dependency_overrides[get_scopus_client] = override_get_scopus_client

    # Мокаем сам сервис поиска, чтобы не стучаться в БД или реальный Scopus
    async def mock_find_and_save(*args, **kwargs):
        return []
    monkeypatch.setattr(SearchService, "find_and_save", mock_find_and_save)

    # Выполняем запрос
    response = await authenticated_client.get("/articles/find?keyword=test&count=10")

    # Очищаем переопределения
    app.dependency_overrides.clear()

    # Проверяем, что заголовки были проброшены из FakeScopusClient в ответ
    assert response.status_code == 200
    assert response.headers.get("x-ratelimit-limit") == "20000"
    assert response.headers.get("x-ratelimit-remaining") == "19884"
    assert response.headers.get("x-ratelimit-reset") == "1774695787"
