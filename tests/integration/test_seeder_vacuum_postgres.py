"""PostgreSQL-only тесты POST /seeder/vacuum — реальный VACUUM ANALYZE.

test_seeder_endpoint.py (SQLite) покрывает счётчик/контракт эндпоинта, но
dialect-check пропускает SQLite мимо реального VACUUM ANALYZE articles —
эта ветка нигде больше не проверяется, поэтому здесь отдельный requires_pg
файл (тот же принцип, что test_journal_impact_postgres.py/
test_find_articles_postgres.py).

Skipped if DATABASE_TEST_URL не задан (см. tests/integration/conftest.py::pg_engine).
"""

from unittest.mock import AsyncMock

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

import app.routers.seeder_router as seeder_module
from app.models.seeder_run_state import SeederRunState

_TEST_SECRET = "test_seeder_secret_ci"


@pytest.mark.asyncio
@pytest.mark.requires_pg
async def test_vacuum_actually_runs_on_tenth_call(pg_client: AsyncClient, pg_session: AsyncSession, monkeypatch):
    """На 10-м вызове реально выполняется VACUUM ANALYZE articles (не бросает
    исключение на настоящем Postgres) и last_vacuum_at проставляется.

    VACUUM теперь уходит в BackgroundTasks (fire-and-forget — см.
    docs/seeder/seeder-vacuum-resilience/spec.md), но ASGI-транспорт в тестах
    (httpx.AsyncClient поверх ASGI-приложения) прогоняет background-задачи
    внутри самого await pg_client.post(...) — Starlette запускает их в
    Response.__call__ до возврата из ASGI-коллбэка. В реальном деплое (uvicorn)
    сетевой клиент получает HTTP-ответ раньше, чем фон отработает; здесь же
    last_vacuum_at уже проставлен к моменту ассерта, без sleep/poll."""
    monkeypatch.setattr(seeder_module, "_SEEDER_SECRET", _TEST_SECRET)
    headers = {"X-Seeder-Secret": _TEST_SECRET}

    for _ in range(9):
        resp = await pg_client.post("/seeder/vacuum", headers=headers)
        assert resp.json()["vacuum_scheduled"] is False

    tenth = await pg_client.post("/seeder/vacuum", headers=headers)
    assert tenth.status_code == 200
    data = tenth.json()
    assert data["run_count"] == 10
    assert data["vacuum_scheduled"] is True

    state = (await pg_session.execute(select(SeederRunState).where(SeederRunState.id == 1))).scalar_one()
    assert state.last_vacuum_at is not None


@pytest.mark.asyncio
@pytest.mark.requires_pg
async def test_vacuum_failure_is_logged_and_alerted_not_raised(pg_client: AsyncClient, monkeypatch):
    """Сбой VACUUM ANALYZE в фоне (после отправки ответа) не пробрасывается
    наружу — пробрасывать уже некому. Ответ уже ушёл 200/vacuum_scheduled=true
    до того, как фон вообще начал выполняться; сбой логируется и алертится тем
    же каналом, что и /seeder/health-check."""
    monkeypatch.setattr(seeder_module, "_SEEDER_SECRET", _TEST_SECRET)
    monkeypatch.setattr(seeder_module, "_run_vacuum_analyze", AsyncMock(side_effect=SQLAlchemyError("boom")))
    monkeypatch.setattr(seeder_module.settings, "FROM_EMAIL", "ops@example.com")
    sent_alerts = []

    class _FakeEmailService:
        async def send_alert_email(self, *, to_email: str, subject: str, message: str) -> None:
            sent_alerts.append((to_email, subject, message))

    monkeypatch.setattr(seeder_module, "get_email_service", lambda: _FakeEmailService())
    headers = {"X-Seeder-Secret": _TEST_SECRET}

    for _ in range(9):
        await pg_client.post("/seeder/vacuum", headers=headers)

    tenth = await pg_client.post("/seeder/vacuum", headers=headers)
    assert tenth.status_code == 200
    assert tenth.json()["vacuum_scheduled"] is True
    assert len(sent_alerts) == 1


@pytest.mark.asyncio
@pytest.mark.requires_pg
async def test_vacuum_does_not_block_concurrent_read(pg_client: AsyncClient, monkeypatch):
    """VACUUM ANALYZE (non-FULL) берёт SHARE UPDATE EXCLUSIVE — не блокирует
    обычные SELECT/INSERT/UPDATE. Реальная проверка: каталожный поиск отвечает
    200 сразу после (не во время специально — non-FULL VACUUM не эксклюзивен
    для чтения в принципе, поэтому таймаут здесь означал бы регрессию)."""
    monkeypatch.setattr(seeder_module, "_SEEDER_SECRET", _TEST_SECRET)
    headers = {"X-Seeder-Secret": _TEST_SECRET}

    for _ in range(10):
        await pg_client.post("/seeder/vacuum", headers=headers)

    resp = await pg_client.get("/articles/", params={"limit": 1})
    assert resp.status_code == 200
