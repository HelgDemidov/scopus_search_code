# tests/integration/test_observability.py
#
# RequestIDMiddleware (X-Request-ID) + global exception handler (issue #48).

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging_config import REQUEST_ID_HEADER
from app.main import app


@pytest.mark.asyncio
async def test_response_has_request_id_header(client: AsyncClient):
    resp = await client.get("/health")
    assert REQUEST_ID_HEADER in resp.headers
    assert len(resp.headers[REQUEST_ID_HEADER]) == 36  # uuid4 в строковом виде


@pytest.mark.asyncio
async def test_request_id_differs_between_requests(client: AsyncClient):
    resp1 = await client.get("/health")
    resp2 = await client.get("/health")
    assert resp1.headers[REQUEST_ID_HEADER] != resp2.headers[REQUEST_ID_HEADER]


@pytest.mark.asyncio
async def test_unhandled_exception_returns_generic_500(client: AsyncClient, monkeypatch):
    """Необработанное исключение → 500 с generic-телом, без утечки traceback клиенту.

    Starlette-специфика: ServerErrorMiddleware отправляет ответ клиенту, а затем
    всё равно re-raise'ит исключение — специально, чтобы ASGI-сервер (или тест-клиент)
    мог залогировать ошибку. httpx.ASGITransport по умолчанию превращает этот re-raise
    в python-исключение теста (raise_app_exceptions=True) — нужно явно отключить,
    чтобы прочитать уже отправленный ответ, как это сделал бы реальный клиент.
    """

    async def broken_execute(self, *args, **kwargs):
        raise RuntimeError("boom — should never reach the client")

    monkeypatch.setattr(AsyncSession, "execute", broken_execute)

    # client уже переопределил get_db_session на тестовую сессию (см. conftest.client) —
    # переиспользуем те же dependency_overrides, меняя только поведение транспорта
    async with AsyncClient(
        transport=ASGITransport(app=app, raise_app_exceptions=False),
        base_url="http://test",
    ) as lenient_client:
        resp = await lenient_client.get("/health/db")

    assert resp.status_code == 500
    assert resp.json() == {"detail": "Internal server error"}
    assert "boom" not in resp.text
    assert REQUEST_ID_HEADER in resp.headers
