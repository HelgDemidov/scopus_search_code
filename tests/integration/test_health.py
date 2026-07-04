# tests/integration/test_health.py
#
# /health, /health/db, /health/redis — health_check_and_alert покрыт отдельно
# в test_seeder_endpoint.py (issue #48).

import pytest
from httpx import AsyncClient

import app.routers.health as health_module


class _FakeRedis:
    def __init__(self, alive: bool) -> None:
        self._alive = alive

    async def ping(self) -> bool:
        return self._alive


@pytest.mark.asyncio
async def test_health_returns_ok(client: AsyncClient):
    resp = await client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


@pytest.mark.asyncio
async def test_health_db_returns_ok(client: AsyncClient):
    resp = await client.get("/health/db")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


@pytest.mark.asyncio
async def test_health_redis_not_configured_when_client_is_none(client: AsyncClient, monkeypatch):
    monkeypatch.setattr(health_module, "redis_client", None)

    resp = await client.get("/health/redis")
    assert resp.status_code == 200
    assert resp.json() == {"status": "not_configured"}


@pytest.mark.asyncio
async def test_health_redis_ok_when_ping_succeeds(client: AsyncClient, monkeypatch):
    monkeypatch.setattr(health_module, "redis_client", _FakeRedis(alive=True))

    resp = await client.get("/health/redis")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


@pytest.mark.asyncio
async def test_health_redis_returns_503_when_ping_fails(client: AsyncClient, monkeypatch):
    monkeypatch.setattr(health_module, "redis_client", _FakeRedis(alive=False))

    resp = await client.get("/health/redis")
    assert resp.status_code == 503
