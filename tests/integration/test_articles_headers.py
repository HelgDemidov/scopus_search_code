import pytest
from httpx import AsyncClient
from app.main import app
from app.core.dependencies import get_scopus_client
from app.services.search_service import SearchService
from app.interfaces.search_client import ISearchClient


# FakeScopusClient реализует полный контракт ISearchClient:
# все @abstractmethod-методы + @property должны быть реализованы,
# чтобы Python убрал имена из __abstractmethods__ и разрешил инстанции.
class FakeScopusClient(ISearchClient):
    def __init__(self):
        # Backing fields для @property rate-limit — мимичируем реальные заголовки Scopus
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

    def build_query(self, keyword: str, filters: dict | None = None) -> str:
        # Заглушка по контракту ISearchClient — тест проверяет заголовки, а не CQL
        return f"TITLE-ABS-KEY({keyword})"

    async def search(
        self,
        keyword: str,
        count: int = 25,
        filters: dict | None = None,  # Добавлен согласно обновленному контракту ISearchClient
    ) -> list:
        # Тест проверяет заголовки, а не результаты поиска — возвращаем пустой список
        return []


async def override_get_scopus_client():
    yield FakeScopusClient()


@pytest.mark.asyncio
async def test_find_articles_rate_limits_headers(authenticated_client: AsyncClient, monkeypatch):
    # Переопределяем зависимость клиента для роутера
    app.dependency_overrides[get_scopus_client] = override_get_scopus_client

    # Мокаем сервис поиска, чтобы не стучаться в БД или реальный Scopus
    async def mock_find_and_save(*args, **kwargs):
        return []
    monkeypatch.setattr(SearchService, "find_and_save", mock_find_and_save)

    response = await authenticated_client.get("/articles/find?keyword=test&count=10")

    # Очищаем переопределения после запроса
    app.dependency_overrides.clear()

    # Проверяем, что заголовки rate-limit были проброшены из FakeScopusClient в ответ
    assert response.status_code == 200
    assert response.headers.get("x-ratelimit-limit") == "20000"
    assert response.headers.get("x-ratelimit-remaining") == "19884"
    assert response.headers.get("x-ratelimit-reset") == "1774695787"
