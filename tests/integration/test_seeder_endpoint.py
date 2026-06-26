# tests/integration/test_seeder_endpoint.py
#
# Интеграционные тесты POST /seeder/seed через TestClient (SQLite in-memory).
# ScopusHTTPClient.search мокается во всех тестах — реальные HTTP-запросы не нужны.
# CatalogService.seed мокается в тестах с возвратом статей, т.к. PostgresCatalogRepository
# использует postgresql-специфичный INSERT, несовместимый с SQLite.

from datetime import date

import pytest
from httpx import AsyncClient

import app.routers.seeder_router as seeder_module
from app.infrastructure.scopus_client import ScopusHTTPClient
from app.models.article import Article
from app.services.catalog_service import CatalogService

_TEST_SECRET = "test_seeder_secret_ci"


def _mk_article(n: int) -> Article:
    return Article(
        title=f"Test Article {n}",
        author="Test Author",
        publication_date=date(2024, 6, 1),
        doi=f"10.test/seeder/{n}",
    )


# ================================================================ #
#  Проверка секрета                                                #
# ================================================================ #

@pytest.mark.asyncio
async def test_seed_wrong_secret_returns_403(client: AsyncClient, monkeypatch):
    monkeypatch.setattr(seeder_module, "_SEEDER_SECRET", _TEST_SECRET)

    resp = await client.post(
        "/seeder/seed",
        headers={"X-Seeder-Secret": "totally_wrong"},
        params={"keyword": "deep learning"},
    )
    assert resp.status_code == 403


# ================================================================ #
#  Пустой ответ Scopus                                             #
# ================================================================ #

@pytest.mark.asyncio
async def test_seed_empty_scopus_returns_saved_zero(client: AsyncClient, monkeypatch):
    monkeypatch.setattr(seeder_module, "_SEEDER_SECRET", _TEST_SECRET)

    async def mock_search(self, keyword, count=25, filters=None, start=0):
        return []

    monkeypatch.setattr(ScopusHTTPClient, "search", mock_search)

    resp = await client.post(
        "/seeder/seed",
        headers={"X-Seeder-Secret": _TEST_SECRET},
        params={"keyword": "deep learning"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["saved"] == 0
    assert data["keyword"] == "deep learning"


# ================================================================ #
#  Параметр start                                                  #
# ================================================================ #

@pytest.mark.asyncio
async def test_seed_start_default_zero_in_response(client: AsyncClient, monkeypatch):
    """start не передан → ответ содержит start=0."""
    monkeypatch.setattr(seeder_module, "_SEEDER_SECRET", _TEST_SECRET)

    async def mock_search(self, keyword, count=25, filters=None, start=0):
        return []

    monkeypatch.setattr(ScopusHTTPClient, "search", mock_search)

    resp = await client.post(
        "/seeder/seed",
        headers={"X-Seeder-Secret": _TEST_SECRET},
        params={"keyword": "neural network"},
    )
    assert resp.status_code == 200
    assert resp.json()["start"] == 0


@pytest.mark.asyncio
async def test_seed_start_param_reflected_in_response(client: AsyncClient, monkeypatch):
    """start=25 → ответ содержит start=25."""
    monkeypatch.setattr(seeder_module, "_SEEDER_SECRET", _TEST_SECRET)

    async def mock_search(self, keyword, count=25, filters=None, start=0):
        return []

    monkeypatch.setattr(ScopusHTTPClient, "search", mock_search)

    resp = await client.post(
        "/seeder/seed",
        headers={"X-Seeder-Secret": _TEST_SECRET},
        params={"keyword": "neural network", "start": 25},
    )
    assert resp.status_code == 200
    assert resp.json()["start"] == 25


@pytest.mark.asyncio
async def test_seed_start_forwarded_to_scopus_client(client: AsyncClient, monkeypatch):
    """start=75 → ScopusHTTPClient.search получает start=75."""
    monkeypatch.setattr(seeder_module, "_SEEDER_SECRET", _TEST_SECRET)

    received: dict = {}

    async def mock_search(self, keyword, count=25, filters=None, start=0):
        received["start"] = start
        return []

    monkeypatch.setattr(ScopusHTTPClient, "search", mock_search)

    await client.post(
        "/seeder/seed",
        headers={"X-Seeder-Secret": _TEST_SECRET},
        params={"keyword": "transformer", "start": 75},
    )
    assert received["start"] == 75


# ================================================================ #
#  Сохранение статей (мок CatalogService.seed)                     #
# ================================================================ #

@pytest.mark.asyncio
async def test_seed_with_articles_returns_correct_saved_count(client: AsyncClient, monkeypatch):
    """Scopus возвращает 3 статьи → ответ содержит saved=3."""
    monkeypatch.setattr(seeder_module, "_SEEDER_SECRET", _TEST_SECRET)

    articles = [_mk_article(i) for i in range(1, 4)]

    async def mock_search(self, keyword, count=25, filters=None, start=0):
        return articles

    async def mock_seed(self, articles, keyword):
        for i, a in enumerate(articles, 1):
            a.id = i
        return articles

    monkeypatch.setattr(ScopusHTTPClient, "search", mock_search)
    monkeypatch.setattr(CatalogService, "seed", mock_seed)

    resp = await client.post(
        "/seeder/seed",
        headers={"X-Seeder-Secret": _TEST_SECRET},
        params={"keyword": "large language model", "start": 50},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["saved"] == 3
    assert data["keyword"] == "large language model"
    assert data["start"] == 50
