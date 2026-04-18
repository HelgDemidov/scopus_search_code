"""E2E smoke-тесты против живого задеплоенного бэкенда.

Запускать ТОЛЬКО когда Railway-деплой из ветки database-search-debugging активен:

    BASE_URL=https://scopus-search-code.up.railway.app \\
    TEST_EMAIL=your@email.com TEST_PASSWORD=YourPass123! \\
    pytest tests/integration/test_article_by_id_e2e.py -v -s

Тесты используют httpx.AsyncClient напрямую к живому API.
Dependency overrides не применяются — это реальная БД Railway + Supabase.
"""

from __future__ import annotations

import os

import httpx
import pytest

# ---------------------------------------------------------------------------
# Настройка: URL берется из переменных окружения
# ---------------------------------------------------------------------------

BASE_URL = os.getenv("BASE_URL", "https://scopus-search-code.up.railway.app")
TEST_EMAIL = os.getenv("TEST_EMAIL", "")
TEST_PASSWORD = os.getenv("TEST_PASSWORD", "")

# Пропускаем весь модуль, если BASE_URL не задан явно (default == prod)
# или если credentials не переданы — защита от случайного запуска
pytestmark = pytest.mark.skipif(
    not os.getenv("BASE_URL"),
    reason="BASE_URL не задан — E2E-тесты пропущены. Установите BASE_URL для запуска.",
)


# ---------------------------------------------------------------------------
# Хелперы
# ---------------------------------------------------------------------------

async def _get_access_token(client: httpx.AsyncClient) -> str | None:
    """Логинится под тестовым пользователем, возвращает AT или None."""
    if not TEST_EMAIL or not TEST_PASSWORD:
        return None
    resp = await client.post(
        f"{BASE_URL}/users/login",
        content=f"username={TEST_EMAIL}&password={TEST_PASSWORD}",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    if resp.status_code == 200:
        return resp.json().get("access_token")
    return None


async def _get_first_article_id(client: httpx.AsyncClient) -> int | None:
    """Берет первую статью из GET /articles/ и возвращает её id."""
    resp = await client.get(f"{BASE_URL}/articles/", params={"page": 1, "size": 1})
    if resp.status_code != 200:
        return None
    data = resp.json()
    if not data.get("articles"):
        return None
    return data["articles"][0].get("id")


# ---------------------------------------------------------------------------
# E2E-тесты
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_e2e_stats_returns_data():
    """
    GET /articles/stats — должен вернуть 200 с ненулевыми total_articles.
    Проверяет что данные из Supabase доступны через Railway.
    """
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(f"{BASE_URL}/articles/stats")

    assert resp.status_code == 200, f"/articles/stats вернул {resp.status_code}: {resp.text}"
    data = resp.json()
    assert "total_articles" in data
    # Если seeder отработал — в БД должны быть статьи
    assert data["total_articles"] > 0, (
        "total_articles == 0. Либо seeder не запускался, либо is_seeded=False для всех записей."
    )


@pytest.mark.asyncio
async def test_e2e_article_list_has_id_field():
    """
    GET /articles/ — каждый объект ArticleResponse должен содержать поле id: int.
    Подтверждает, что изменение article_schemas.py (пункт 1) дошло до продакшн-деплоя.
    """
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(f"{BASE_URL}/articles/", params={"page": 1, "size": 5})

    assert resp.status_code == 200
    data = resp.json()
    assert "articles" in data
    assert len(data["articles"]) > 0, "Список статей пуст — нет данных в БД"

    for article in data["articles"]:
        assert "id" in article, f"Поле id отсутствует в статье: {article}"
        assert isinstance(article["id"], int), f"id должен быть int, получен {type(article['id'])}"


@pytest.mark.asyncio
async def test_e2e_get_article_by_id():
    """
    GET /articles/{id} — сквозная проверка нового эндпоинта на живом деплое.
    Берет первый id из листинга, затем запрашивает его напрямую.
    """
    async with httpx.AsyncClient(timeout=15.0) as client:
        article_id = await _get_first_article_id(client)
        assert article_id is not None, "Не удалось получить id из /articles/ — БД пуста"

        resp = await client.get(f"{BASE_URL}/articles/{article_id}")

    assert resp.status_code == 200, f"/articles/{article_id} вернул {resp.status_code}: {resp.text}"
    data = resp.json()

    # Проверяем полный контракт ArticleResponse
    assert data["id"] == article_id
    assert isinstance(data["title"], str) and data["title"]
    assert "publication_date" in data
    assert "keyword" in data


@pytest.mark.asyncio
async def test_e2e_article_by_id_404():
    """
    GET /articles/999999999 — несуществующий id должен давать 404 (не 500, не 422).
    """
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(f"{BASE_URL}/articles/999999999")

    assert resp.status_code == 404
    assert resp.json()["detail"] == "Article not found"


@pytest.mark.asyncio
async def test_e2e_stats_not_shadowed_by_id_route():
    """
    /articles/stats не должен перехватываться маршрутом /{id}.
    Если маршрут /{id} стоит РАНЬШЕ /stats — FastAPI попытается привести
    строку 'stats' к int и вернет 422, а не 200.
    """
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(f"{BASE_URL}/articles/stats")

    assert resp.status_code == 200, (
        f"/articles/stats вернул {resp.status_code}. "
        "Возможно маршрут /{{id}} объявлен РАНЬШЕ /stats — исправить порядок в routers/articles.py"
    )


@pytest.mark.asyncio
async def test_e2e_find_requires_auth():
    """
    GET /articles/find без токена должен вернуть 401/403, а не 422.
    Проверяет что /find не перехвачен маршрутом /{id}.
    """
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(f"{BASE_URL}/articles/find", params={"keyword": "AI"})

    assert resp.status_code in (401, 403), (
        f"/articles/find вернул {resp.status_code}. "
        "Ожидался 401/403 (не авторизован), а не 422 (перехват как int id)."
    )


@pytest.mark.asyncio
async def test_e2e_authenticated_find(monkeypatch):
    """
    GET /articles/find с токеном — авторизованный live-поиск через Scopus.
    Пропускается если TEST_EMAIL/TEST_PASSWORD не заданы.
    """
    if not TEST_EMAIL or not TEST_PASSWORD:
        pytest.skip("TEST_EMAIL/TEST_PASSWORD не заданы — тест пропущен")

    async with httpx.AsyncClient(timeout=30.0) as client:
        token = await _get_access_token(client)
        assert token, "Логин не удался"

        resp = await client.get(
            f"{BASE_URL}/articles/find",
            params={"keyword": "machine learning", "count": 3},
            headers={"Authorization": f"Bearer {token}"},
        )

    assert resp.status_code == 200, f"/articles/find вернул {resp.status_code}: {resp.text}"
    data = resp.json()
    assert isinstance(data, list)
    # Каждая найденная статья должна содержать id (пункт 1 сводной таблицы)
    for article in data:
        assert "id" in article, f"Поле id отсутствует в результате live-поиска: {article}"
