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
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.refresh_token_utils import cleanup_stale_tokens, get_valid_refresh_token, revoke_all_user_tokens
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
    # headers={Cookie} вместо cookies={}: избегаем httpx DeprecationWarning,
    # raw-заголовок не обновляет jar — rt_v1 гарантированно уходит на оба запроса
    first_resp = await client.post(
        "/auth/refresh",
        headers={"Cookie": f"refresh_token={rt_v1}"},
    )
    assert first_resp.status_code == 200, f"Первый refresh провалился: {first_resp.text}"

    # Второй refresh с тем же (уже отозванным) RT_v1
    replay_resp = await client.post(
        "/auth/refresh",
        headers={"Cookie": f"refresh_token={rt_v1}"},
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
        headers={"Cookie": f"refresh_token={expired_rt}"},
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
        headers={"Cookie": f"refresh_token={rt}"},
    )
    assert first_resp.status_code == 200
    assert first_resp.json() == {"ok": True}

    # Второй logout с тем же RT — должен вернуть 200, не 500
    second_resp = await client.post(
        "/auth/logout",
        headers={"Cookie": f"refresh_token={rt}"},
    )
    assert second_resp.status_code == 200, (
        f"Повторный logout должен быть идемпотентным, получили: {second_resp.status_code}"
    )
    assert second_resp.json() == {"ok": True}


# ---------------------------------------------------------------------------
# Прямые тесты функций refresh_token_utils (SQLite, без HTTP-слоя)
# ---------------------------------------------------------------------------


async def _create_user(session: AsyncSession, email: str = "rt_direct@example.com") -> User:
    user = User(username="rt_direct_user", email=email, hashed_password="fakehash")
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


@pytest.mark.asyncio
async def test_revoke_all_user_tokens_marks_all_revoked(db_session: AsyncSession) -> None:
    """revoke_all_user_tokens переводит все активные RT пользователя в revoked=True."""
    user = await _create_user(db_session)
    user_id = user.id  # plain int — не зависит от ORM-состояния после expire_all

    rt1 = RefreshToken(
        token="active-rt-aaa111",
        user_id=user_id,
        expires_at=datetime.now(timezone.utc) + timedelta(days=10),
        revoked=False,
    )
    rt2 = RefreshToken(
        token="active-rt-bbb222",
        user_id=user_id,
        expires_at=datetime.now(timezone.utc) + timedelta(days=10),
        revoked=False,
    )
    db_session.add_all([rt1, rt2])
    await db_session.commit()

    await revoke_all_user_tokens(user_id=user_id, session=db_session)

    db_session.expire_all()
    result = await db_session.execute(select(RefreshToken).where(RefreshToken.user_id == user_id))
    tokens = result.scalars().all()
    assert len(tokens) == 2
    assert all(t.revoked for t in tokens)


@pytest.mark.asyncio
async def test_cleanup_stale_tokens_removes_stale_keeps_valid(db_session: AsyncSession) -> None:
    """cleanup_stale_tokens удаляет истёкшие и отозванные RT, оставляет действующий."""
    user = await _create_user(db_session)
    user_id = user.id  # plain int — не зависит от ORM-состояния после expire_all

    stale_revoked = RefreshToken(
        token="stale-rev-ccc333",
        user_id=user_id,
        expires_at=datetime.now(timezone.utc) + timedelta(days=5),
        revoked=True,
    )
    stale_expired = RefreshToken(
        token="stale-exp-ddd444",
        user_id=user_id,
        expires_at=datetime.now(timezone.utc) - timedelta(days=1),
        revoked=False,
    )
    valid = RefreshToken(
        token="valid-rt-eee555",
        user_id=user_id,
        expires_at=datetime.now(timezone.utc) + timedelta(days=10),
        revoked=False,
    )
    db_session.add_all([stale_revoked, stale_expired, valid])
    await db_session.commit()

    await cleanup_stale_tokens(user_id=user_id, session=db_session)

    db_session.expire_all()
    result = await db_session.execute(select(RefreshToken).where(RefreshToken.user_id == user_id))
    remaining = result.scalars().all()
    assert len(remaining) == 1
    assert remaining[0].token == "valid-rt-eee555"


@pytest.mark.asyncio
async def test_get_valid_refresh_token_expired_returns_none(db_session: AsyncSession) -> None:
    """get_valid_refresh_token возвращает None для просроченного токена."""
    user = await _create_user(db_session)
    user_id = user.id

    expired_rt = RefreshToken(
        token="expired-direct-fff666",
        user_id=user_id,
        expires_at=datetime.now(timezone.utc) - timedelta(days=1),
        revoked=False,
    )
    db_session.add(expired_rt)
    await db_session.commit()

    result = await get_valid_refresh_token("expired-direct-fff666", db_session)
    assert result is None
