# tests/integration/test_seeder_endpoint.py
#
# Интеграционные тесты POST /seeder/seed через TestClient (SQLite in-memory).
# ScopusHTTPClient.search мокается во всех тестах — реальные HTTP-запросы не нужны.
# CatalogService.seed мокается в тестах с возвратом статей, т.к. PostgresCatalogRepository
# использует postgresql-специфичный INSERT, несовместимый с SQLite.

from datetime import date

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import app.routers.seeder_router as seeder_module
from app.core.dependencies import get_email_service
from app.infrastructure.scopus_client import ScopusHTTPClient
from app.interfaces.email_service import IEmailService
from app.main import app
from app.models.article import Article
from app.models.catalog_article import CatalogArticle
from app.services.catalog_service import CatalogService


class _SpyEmailService(IEmailService):
    """Фиксирует вызовы send_alert_email — реальный Brevo API не дергается."""

    def __init__(self) -> None:
        self.alerts_sent: list[tuple[str, str, str]] = []

    async def send_password_reset_email(self, to_email: str, reset_url: str) -> None:
        pass

    async def send_alert_email(self, to_email: str, subject: str, message: str) -> None:
        self.alerts_sent.append((to_email, subject, message))


class _FakeRedis:
    def __init__(self, alive: bool) -> None:
        self._alive = alive

    async def ping(self) -> bool:
        return self._alive


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


# ================================================================ #
#  GC статей-сирот (POST /seeder/gc)                               #
# ================================================================ #


@pytest.mark.asyncio
async def test_gc_wrong_secret_returns_403(client: AsyncClient, monkeypatch):
    monkeypatch.setattr(seeder_module, "_SEEDER_SECRET", _TEST_SECRET)

    resp = await client.post("/seeder/gc", headers={"X-Seeder-Secret": "totally_wrong"})
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_gc_deletes_orphan_and_keeps_catalog_article(
    client: AsyncClient, db_session: AsyncSession, monkeypatch
):
    monkeypatch.setattr(seeder_module, "_SEEDER_SECRET", _TEST_SECRET)

    orphan = _mk_article(100)
    catalog_article = _mk_article(101)
    db_session.add_all([orphan, catalog_article])
    await db_session.flush()
    db_session.add(CatalogArticle(article_id=catalog_article.id, keyword="gc-test"))
    await db_session.commit()

    resp = await client.post("/seeder/gc", headers={"X-Seeder-Secret": _TEST_SECRET})
    assert resp.status_code == 200
    assert resp.json() == {"deleted": 1}

    remaining_dois = {a.doi for a in (await db_session.execute(select(Article))).scalars().all()}
    assert remaining_dois == {catalog_article.doi}


@pytest.mark.asyncio
async def test_gc_no_orphans_returns_zero(client: AsyncClient, monkeypatch):
    monkeypatch.setattr(seeder_module, "_SEEDER_SECRET", _TEST_SECRET)

    resp = await client.post("/seeder/gc", headers={"X-Seeder-Secret": _TEST_SECRET})
    assert resp.status_code == 200
    assert resp.json() == {"deleted": 0}


# ================================================================ #
#  Health-check алертинг (POST /seeder/health-check, issue #48)     #
# ================================================================ #


@pytest.mark.asyncio
async def test_health_check_wrong_secret_returns_403(client: AsyncClient, monkeypatch):
    monkeypatch.setattr(seeder_module, "_SEEDER_SECRET", _TEST_SECRET)

    resp = await client.post("/seeder/health-check", headers={"X-Seeder-Secret": "totally_wrong"})
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_health_check_all_ok_returns_ok(client: AsyncClient, monkeypatch):
    monkeypatch.setattr(seeder_module, "_SEEDER_SECRET", _TEST_SECRET)
    monkeypatch.setattr(seeder_module, "redis_client", None)

    resp = await client.post("/seeder/health-check", headers={"X-Seeder-Secret": _TEST_SECRET})
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


@pytest.mark.asyncio
async def test_health_check_redis_down_sends_alert_and_returns_degraded(client: AsyncClient, monkeypatch):
    monkeypatch.setattr(seeder_module, "_SEEDER_SECRET", _TEST_SECRET)
    monkeypatch.setattr(seeder_module, "redis_client", _FakeRedis(alive=False))
    monkeypatch.setattr(seeder_module.settings, "FROM_EMAIL", "owner@example.com")

    spy = _SpyEmailService()
    app.dependency_overrides[get_email_service] = lambda: spy
    try:
        resp = await client.post("/seeder/health-check", headers={"X-Seeder-Secret": _TEST_SECRET})
    finally:
        app.dependency_overrides.pop(get_email_service, None)

    assert resp.status_code == 200
    assert resp.json() == {"status": "degraded", "problems": "redis"}
    assert len(spy.alerts_sent) == 1
    assert spy.alerts_sent[0][0] == "owner@example.com"


@pytest.mark.asyncio
async def test_health_check_db_down_sends_alert_and_returns_degraded(client: AsyncClient, monkeypatch):
    from sqlalchemy.exc import SQLAlchemyError
    from sqlalchemy.ext.asyncio import AsyncSession

    monkeypatch.setattr(seeder_module, "_SEEDER_SECRET", _TEST_SECRET)
    monkeypatch.setattr(seeder_module, "redis_client", None)
    monkeypatch.setattr(seeder_module.settings, "FROM_EMAIL", "owner@example.com")

    async def broken_execute(self, *args, **kwargs):
        raise SQLAlchemyError("db down")

    monkeypatch.setattr(AsyncSession, "execute", broken_execute)

    spy = _SpyEmailService()
    app.dependency_overrides[get_email_service] = lambda: spy
    try:
        resp = await client.post("/seeder/health-check", headers={"X-Seeder-Secret": _TEST_SECRET})
    finally:
        app.dependency_overrides.pop(get_email_service, None)

    assert resp.status_code == 200
    assert resp.json() == {"status": "degraded", "problems": "database"}
    assert len(spy.alerts_sent) == 1


@pytest.mark.asyncio
async def test_health_check_no_from_email_skips_alert(client: AsyncClient, monkeypatch):
    """FROM_EMAIL не задан (локальный дефолт) — email не отправляется, но статус честно 'degraded'."""
    monkeypatch.setattr(seeder_module, "_SEEDER_SECRET", _TEST_SECRET)
    monkeypatch.setattr(seeder_module, "redis_client", _FakeRedis(alive=False))
    monkeypatch.setattr(seeder_module.settings, "FROM_EMAIL", "")

    spy = _SpyEmailService()
    app.dependency_overrides[get_email_service] = lambda: spy
    try:
        resp = await client.post("/seeder/health-check", headers={"X-Seeder-Secret": _TEST_SECRET})
    finally:
        app.dependency_overrides.pop(get_email_service, None)

    assert resp.status_code == 200
    assert resp.json() == {"status": "degraded", "problems": "redis"}
    assert spy.alerts_sent == []
