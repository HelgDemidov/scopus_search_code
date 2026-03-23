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
                date=date(2026, 1, 1), 
                doi="10.123/mock1", 
                keyword=keyword
            ),
            Article(
                title="Mocked Scopus Paper 2", 
                author="Jane Smith", 
                date=date(2026, 1, 2), 
                doi="10.123/mock2", 
                keyword=keyword
            )
        ]
    
    # monkeypatch перехватывает вызов метода search в нашем клиенте и подставляет mock_search
    monkeypatch.setattr("app.infrastructure.scopus_client.ScopusHTTPClient.search", mock_search)


@pytest.mark.asyncio
async def test_find_and_save_articles_integration(authenticated_client: AsyncClient):
    # Установка (Arrange) больше не нужна: authenticated_client содержит JWT-токен в заголовках, юзер есть в БД

    # Act 1: Идем на эндпоинт поиска Scopus: теперь headers=headers уже вшиты в клиент, передавать не нужно
    find_response = await authenticated_client.get(
        "/articles/find", 
        params={"keyword": "AI"}
    )
    
    # Assert 1: Проверяем ответ ручки /find
    assert find_response.status_code == 200
    find_data = find_response.json()
    assert len(find_data) == 2
    assert find_data[0]["title"] == "Mocked Scopus Paper 1"

    # Act 2: Проверяем, что статьи реально записались в БД 
    get_response = await authenticated_client.get("/articles/", params={"page": 1, "size": 10})
    
    # Assert 2: Проверяем публичную выдачу
    assert get_response.status_code == 200
    get_data = get_response.json()
    assert get_data["total"] == 2
    assert get_data["articles"][0]["keyword"] == "AI"

