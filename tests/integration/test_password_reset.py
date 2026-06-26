"""Тесты сброса пароля через email.

Покрываемые сценарии:
  - POST /auth/password-reset с несуществующим email → 200 (не раскрываем аккаунт)
  - POST /auth/password-reset с существующим email → 200 + токен создан в БД
  - POST /auth/password-reset/confirm с невалидным токеном → 422
  - POST /auth/password-reset/confirm с истёкшим токеном → 422
  - POST /auth/password-reset/confirm с already-used токеном → 422
  - Успешный confirm → пароль изменён + все RT revoked
  - После confirm → логин со старым паролем → 401
  - После confirm → логин с новым паролем → 200
  - Слабый пароль на confirm → 422
"""

from datetime import datetime, timedelta, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_email_service
from app.interfaces.email_service import IEmailService
from app.main import app
from app.models.password_reset_token import PasswordResetToken
from app.models.refresh_token import RefreshToken


# ---------------------------------------------------------------------------
# No-op email-сервис: SMTP не вызывается, но интерфейс соблюдён
# ---------------------------------------------------------------------------

class _NoOpEmailService(IEmailService):
    async def send_password_reset_email(self, to_email: str, reset_url: str) -> None:
        pass


# ---------------------------------------------------------------------------
# Фикстура: подмена email-сервиса для всех тестов модуля
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def override_email_service():
    """Подменяет SMTP-сервис no-op заглушкой для всех тестов в модуле."""
    app.dependency_overrides[get_email_service] = lambda: _NoOpEmailService()
    yield
    app.dependency_overrides.pop(get_email_service, None)


# ---------------------------------------------------------------------------
# POST /auth/password-reset
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_password_reset_request_unknown_email_returns_200(
    client: AsyncClient,
) -> None:
    """Несуществующий email → 200 с одинаковым сообщением (не раскрываем наличие аккаунта)."""
    resp = await client.post(
        "/auth/password-reset",
        json={"email": "nonexistent@example.com"},
    )
    assert resp.status_code == 200
    assert "reset link" in resp.json()["message"]


@pytest.mark.asyncio
async def test_password_reset_request_known_email_creates_token(
    client: AsyncClient,
    db_session: AsyncSession,
    registered_user: dict,
) -> None:
    """Существующий email → 200 + токен появляется в password_reset_tokens."""
    resp = await client.post(
        "/auth/password-reset",
        json={"email": registered_user["email"]},
    )
    assert resp.status_code == 200

    rows = (await db_session.execute(select(PasswordResetToken))).scalars().all()
    assert len(rows) == 1
    assert rows[0].used is False

    expires_at_utc = (
        rows[0].expires_at.replace(tzinfo=timezone.utc)
        if rows[0].expires_at.tzinfo is None
        else rows[0].expires_at
    )
    assert expires_at_utc > datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# POST /auth/password-reset/confirm — негативные сценарии
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_password_reset_confirm_invalid_token_returns_422(
    client: AsyncClient,
) -> None:
    """Несуществующий токен → 422."""
    resp = await client.post(
        "/auth/password-reset/confirm",
        json={"token": "totally-fake-token", "new_password": "NewPass1!"},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_password_reset_confirm_expired_token_returns_422(
    client: AsyncClient,
    db_session: AsyncSession,
    registered_user: dict,
) -> None:
    """Истёкший токен → 422."""
    await client.post(
        "/auth/password-reset",
        json={"email": registered_user["email"]},
    )

    prt = (await db_session.execute(select(PasswordResetToken))).scalar_one()
    prt.expires_at = datetime.now(timezone.utc) - timedelta(hours=2)
    await db_session.commit()

    resp = await client.post(
        "/auth/password-reset/confirm",
        json={"token": prt.token, "new_password": "NewPass1!"},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_password_reset_confirm_used_token_returns_422(
    client: AsyncClient,
    db_session: AsyncSession,
    registered_user: dict,
) -> None:
    """Already-used токен → 422 (защита от replay)."""
    await client.post("/auth/password-reset", json={"email": registered_user["email"]})
    prt = (await db_session.execute(select(PasswordResetToken))).scalar_one()
    token = prt.token

    # Первое использование — успех
    resp = await client.post(
        "/auth/password-reset/confirm",
        json={"token": token, "new_password": "NewPass1!"},
    )
    assert resp.status_code == 200

    # Повторное использование — 422
    resp = await client.post(
        "/auth/password-reset/confirm",
        json={"token": token, "new_password": "AnotherPass2@"},
    )
    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# POST /auth/password-reset/confirm — успешный сценарий
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_password_reset_confirm_success_revokes_all_rt(
    client: AsyncClient,
    db_session: AsyncSession,
    registered_user: dict,
    logged_in: dict,
) -> None:
    """После confirm: токен помечен used=True, все RT пользователя revoked=True."""
    await client.post("/auth/password-reset", json={"email": registered_user["email"]})
    prt = (await db_session.execute(select(PasswordResetToken))).scalar_one()
    token = prt.token

    resp = await client.post(
        "/auth/password-reset/confirm",
        json={"token": token, "new_password": "NewPass1!"},
    )
    assert resp.status_code == 200
    assert resp.json()["message"] == "Password updated successfully."

    db_session.expire_all()

    updated_prt = (
        await db_session.execute(
            select(PasswordResetToken).where(PasswordResetToken.token == token)
        )
    ).scalar_one()
    assert updated_prt.used is True

    rt_rows = (await db_session.execute(select(RefreshToken))).scalars().all()
    assert all(rt.revoked for rt in rt_rows), "Все RT должны быть revoked после смены пароля"


@pytest.mark.asyncio
async def test_password_reset_confirm_old_password_rejected(
    client: AsyncClient,
    db_session: AsyncSession,
    registered_user: dict,
) -> None:
    """После confirm старый пароль → 401 на /users/login."""
    await client.post("/auth/password-reset", json={"email": registered_user["email"]})
    prt = (await db_session.execute(select(PasswordResetToken))).scalar_one()

    await client.post(
        "/auth/password-reset/confirm",
        json={"token": prt.token, "new_password": "NewPass1!"},
    )

    resp = await client.post(
        "/users/login",
        json={"email": registered_user["email"], "password": registered_user["password"]},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_password_reset_confirm_new_password_accepted(
    client: AsyncClient,
    db_session: AsyncSession,
    registered_user: dict,
) -> None:
    """После confirm новый пароль → 200 + access_token на /users/login."""
    new_password = "NewPass1!"
    await client.post("/auth/password-reset", json={"email": registered_user["email"]})
    prt = (await db_session.execute(select(PasswordResetToken))).scalar_one()

    await client.post(
        "/auth/password-reset/confirm",
        json={"token": prt.token, "new_password": new_password},
    )

    resp = await client.post(
        "/users/login",
        json={"email": registered_user["email"], "password": new_password},
    )
    assert resp.status_code == 200
    assert "access_token" in resp.json()


@pytest.mark.asyncio
async def test_password_reset_confirm_weak_password_returns_422(
    client: AsyncClient,
    db_session: AsyncSession,
    registered_user: dict,
) -> None:
    """Слабый пароль на confirm → 422 от Pydantic field_validator."""
    await client.post("/auth/password-reset", json={"email": registered_user["email"]})
    prt = (await db_session.execute(select(PasswordResetToken))).scalar_one()

    resp = await client.post(
        "/auth/password-reset/confirm",
        json={"token": prt.token, "new_password": "weakpassword"},
    )
    assert resp.status_code == 422
