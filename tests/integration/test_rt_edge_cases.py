"""Edge-case тесты refresh token.

4 независимых теста, каждый проверяет один путь отказа:
1. Запрос /auth/refresh без cookie вообще → 401
2. Повторное использование отозванного RT (replay-атака) → 401
3. Просроченный RT (expires_at в прошлом) → 401
4. Двойной logout (идемпотентность) → 200 оба раза
"""
from datetime import datetime, timedelta, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.refresh_token import RefreshToken
from app.models.user import User


# ---------------------------------------------------------------------------
# Вспомогательная функция: создает пользователя + просроченный RT напрямую в БД
# ---------------------------------------------------------------------------

async def _seed_expired_rt(session: AsyncSession) -> tuple[str, str]:
    """Возвращает (email, expired_rt_value) — не идет через HTTP-слой."""
    user = User(
        username="expired_user",
        email="expired@example.com",
        hashed_password=hash_password("AnyPass!1"),
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)

    expired_token = "test-expired-rt-value-0000000000000"
    rt = RefreshToken(
        token=expired_token,
        user_id=user.id,
        # Вчера — гарантированно истёк
        expires_at=datetime.now(timezone.utc) - timedelta(days=1),
        revoked=False,
    )
    session.add(rt)
    await session.commit()
    return user.email, expired_token


# ---------------------------------------------------------------------------
# Тест 1: нет cookie вообще
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_refresh_without_cookie(client: AsyncClient) -> None:
    """POST /auth/refresh без Cookie → 401 + понятное сообщение об ошибке."""
    resp = await client.post("/auth/refresh")

    assert resp.status_code == 401
    assert "refresh token" in resp.json()["detail"].lower()


# ---------------------------------------------------------------------------
# Тест 2: повторное использование отозванного RT (replay-атака)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_refresh_with_revoked_token(
    client: AsyncClient,
    logged_in: dict,
) -> None:
    """RT после первого /auth/refresh помечается revoked=True и отклоняется повторно."""
    rt_v1 = logged_in["rt_cookie"]

    # Первый refresh — легитимный, RT_v1 ротируется
    first_resp = await client.post(
        "/auth/refresh",
        cookies={"refresh_token": rt_v1},
    )
    assert first_resp.status_code == 200, f"Первый refresh провалился: {first_resp.text}"

    # Второй refresh с тем же (уже отозванным) RT_v1
    replay_resp = await client.post(
        "/auth/refresh",
        cookies={"refresh_token": rt_v1},
    )
    assert replay_resp.status_code == 401
    detail = replay_resp.json()["detail"].lower()
    # Сообщение должно содержать слово expired или revoked
    assert "expired" in detail or "revoked" in detail or "invalid" in detail


# ---------------------------------------------------------------------------
# Тест 3: просроченный RT (expires_at < now)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_refresh_with_expired_token(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """RT с expires_at в прошлом отклоняется с 401."""
    _email, expired_rt = await _seed_expired_rt(db_session)

    resp = await client.post(
        "/auth/refresh",
        cookies={"refresh_token": expired_rt},
    )
    assert resp.status_code == 401
    detail = resp.json()["detail"].lower()
    assert "expired" in detail or "invalid" in detail


# ---------------------------------------------------------------------------
# Тест 4: двойной logout (идемпотентность)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_logout_idempotent(
    client: AsyncClient,
    logged_in: dict,
) -> None:
    """Двойной вызов POST /auth/logout не должен вызывать ошибку — оба раза 200."""
    rt = logged_in["rt_cookie"]

    # Первый logout — RT отзывается
    first_resp = await client.post(
        "/auth/logout",
        cookies={"refresh_token": rt},
    )
    assert first_resp.status_code == 200
    assert first_resp.json() == {"ok": True}

    # Второй logout с тем же RT — должен вернуть 200, не 500
    second_resp = await client.post(
        "/auth/logout",
        cookies={"refresh_token": rt},
    )
    assert second_resp.status_code == 200, (
        f"Повторный logout должен быть идемпотентным, получили: {second_resp.status_code}"
    )
    assert second_resp.json() == {"ok": True}
