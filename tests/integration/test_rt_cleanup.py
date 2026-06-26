"""Тест piggyback cleanup устаревших refresh token.

Сценарий: после логина seeder'им 2 стейл-строки (одна revoked=True,
одна expired) для того же user_id. Вызываем POST /auth/refresh —
cleanup_stale_tokens() удаляет обе, в таблице остаётся только новый RT.
"""

from datetime import datetime, timedelta, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.refresh_token import RefreshToken


@pytest.mark.asyncio
async def test_refresh_cleanup_removes_stale_tokens(
    client: AsyncClient,
    db_session: AsyncSession,
    logged_in: dict,
) -> None:
    """POST /auth/refresh удаляет устаревшие RT того же пользователя (piggyback cleanup)."""
    # --- Шаг 1: получаем user_id из существующего RT ---
    result = await db_session.execute(select(RefreshToken).where(RefreshToken.token == logged_in["rt_cookie"]))
    existing_rt = result.scalar_one()
    user_id = existing_rt.user_id

    # --- Шаг 2: добавляем 2 устаревших RT напрямую в БД ---
    stale_revoked = RefreshToken(
        token="stale-revoked-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        user_id=user_id,
        expires_at=datetime.now(timezone.utc) + timedelta(days=10),  # не истёк, но отозван
        revoked=True,
    )
    stale_expired = RefreshToken(
        token="stale-expired-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        user_id=user_id,
        expires_at=datetime.now(timezone.utc) - timedelta(days=1),  # истёк вчера
        revoked=False,
    )
    db_session.add_all([stale_revoked, stale_expired])
    await db_session.commit()

    # --- Шаг 3: убеждаемся, что перед вызовом в таблице 3 строки ---
    pre_rows = (
        (await db_session.execute(select(RefreshToken).where(RefreshToken.user_id == user_id))).scalars().all()
    )
    assert len(pre_rows) == 3, f"Ожидалось 3 RT перед cleanup, нашли {len(pre_rows)}"

    # --- Шаг 4: POST /auth/refresh — тригерит ротацию + piggyback cleanup ---
    resp = await client.post(
        "/auth/refresh",
        headers={"Cookie": f"refresh_token={logged_in['rt_cookie']}"},
    )
    assert resp.status_code == 200, f"/auth/refresh провалился: {resp.text}"

    # --- Шаг 5: сбрасываем identity map, делаем свежий SELECT ---
    # expire_on_commit=False означает, что SQLAlchemy не делает это автоматически;
    # без expire_all() запрос вернёт закешированные объекты, а не актуальное состояние БД.
    # expire_all() — синхронный метод (не coroutine) в SQLAlchemy 2.x.
    db_session.expire_all()
    post_rows = (
        (await db_session.execute(select(RefreshToken).where(RefreshToken.user_id == user_id))).scalars().all()
    )

    assert len(post_rows) == 1, f"После cleanup должна остаться 1 строка (новый RT), нашли {len(post_rows)}"

    # --- Шаг 6: оставшийся RT — именно новый, валидный ---
    new_rt_cookie = resp.cookies.get("refresh_token")
    assert post_rows[0].token == new_rt_cookie, "Оставшийся RT должен совпадать с новым cookie"
    assert not post_rows[0].revoked, "Новый RT не должен быть отозван"
    # SQLite возвращает naive datetime — нормализуем к UTC для сравнения (как в get_valid_refresh_token)
    expires_at = post_rows[0].expires_at
    expires_at_utc = expires_at if expires_at.tzinfo else expires_at.replace(tzinfo=timezone.utc)
    assert expires_at_utc > datetime.now(timezone.utc), "Новый RT должен быть валидным"
