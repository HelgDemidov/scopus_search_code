from datetime import date

import pytest
from httpx import AsyncClient

from app.models.article import Article


# 1. Создаем заглушку для метода search внутри ScopusHTTPClient
@pytest.fixture(autouse=True)
def mock_scopus_api(monkeypatch):
    """
    Эта фикстура автоматически подменяет реальный метод поиска на наш фейковый.
    """
    async def mock_search(self, keyword: str, count: int = 10):
        # Вместо запроса в интернет, всегда возвращаем 2 фейковые статьи
        return [
            Article(
                title="Mocked Scopus Paper 1",
                author="John Doe",
                publication_date=date(2026, 1, 1),
                doi="10.123/mock1",
            ),
            Article(
                title="Mocked Scopus Paper 2",
                author="Jane Smith",
                publication_date=date(2026, 1, 2),
                doi="10.123/mock2",
            )
        ]

    # monkeypatch перехватывает вызов метода search в нашем клиенте и подставляет mock_search
    monkeypatch.setattr("app.infrastructure.scopus_client.ScopusHTTPClient.search", mock_search)


@pytest.mark.asyncio
async def test_find_and_save_articles_integration(authenticated_client: AsyncClient):
    # Act 1: поиск через Scopus
    find_response = await authenticated_client.get(
        "/articles/find",
        params={"keyword": "AI"}
    )

    # Assert 1: /find возвращает 2 статьи
    assert find_response.status_code == 200
    find_data = find_response.json()
    assert len(find_data) == 2
    assert find_data[0]["title"] == "Mocked Scopus Paper 1"

    # Act 2: проверяем, что поиск записан в историю пользователя
    # После рефакторинга /articles/ — каталог сидированных статей (is_seeded=True),
    # результаты пользовательского поиска хранятся в /articles/history
    history_response = await authenticated_client.get("/articles/history")

    # Assert 2: одна запись истории с корректными данными
    assert history_response.status_code == 200
    history_data = history_response.json()
    assert history_data["total"] == 1
    assert history_data["items"][0]["query"] == "AI"
    assert history_data["items"][0]["result_count"] == 2
