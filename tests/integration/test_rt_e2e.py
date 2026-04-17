"""E2E-тест: полный жизненный цикл refresh token.

Сценарий: login → /users/me → refresh → старый RT отклонен →
          новый AT работает → logout → RT отозван в БД.

Все 8 шагов в одной тест-функции для наглядности цепочки.
"""
import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.refresh_token import RefreshToken


@pytest.mark.asyncio
async def test_full_refresh_token_lifecycle(
    client: AsyncClient,
    logged_in: dict,
    db_session: AsyncSession,
) -> None:
    at_v1 = logged_in["access_token"]
    rt_v1 = logged_in["rt_cookie"]

    # --- Шаг 1: login уже выполнен фикстурой logged_in ---
    # Проверяем, что RT cookie был установлен с нужными атрибутами
    # (фикстура упала бы при assert, если cookie отсутствует)
    assert at_v1
    assert rt_v1

    # --- Шаг 2: защищенный запрос с AT_v1 ---
    me_resp = await client.get(
        "/users/me",
        headers={"Authorization": f"Bearer {at_v1}"},
    )
    assert me_resp.status_code == 200, f"/users/me failed: {me_resp.text}"
    assert me_resp.json()["email"] == "test@example.com"

    # --- Шаг 3: обмен RT_v1 → AT_v2 + RT_v2 ---
    # headers={Cookie} вместо cookies={}: избегаем httpx DeprecationWarning,
    # raw-заголовок не обновляет jar — диагностика replay-атаки сохранена
    refresh_resp = await client.post(
        "/auth/refresh",
        headers={"Cookie": f"refresh_token={rt_v1}"},
    )
    assert refresh_resp.status_code == 200, f"/auth/refresh failed: {refresh_resp.text}"

    at_v2 = refresh_resp.json()["access_token"]
    rt_v2 = refresh_resp.cookies.get("refresh_token")

    # Новый AT и RT должны отличаться от старых
    assert at_v2 != at_v1, "Новый AT должен отличаться от старого"
    assert rt_v2 is not None, "Новый RT cookie должен быть в ответе"
    assert rt_v2 != rt_v1, "Новый RT должен отличаться от старого (ротация)"

    # --- Шаг 4: RT_v1 должен быть отозван после ротации ---
    replay_resp = await client.post(
        "/auth/refresh",
        headers={"Cookie": f"refresh_token={rt_v1}"},
    )
    assert replay_resp.status_code == 401, (
        "Отозванный RT должен отклоняться (защита от replay-атак)"
    )

    # --- Шаг 5: новый AT_v2 работает ---
    me_resp2 = await client.get(
        "/users/me",
        headers={"Authorization": f"Bearer {at_v2}"},
    )
    assert me_resp2.status_code == 200, f"/users/me с новым AT провалился: {me_resp2.text}"
    assert me_resp2.json()["email"] == "test@example.com"

    # --- Шаг 6: logout — отзываем RT_v2 на сервере ---
    logout_resp = await client.post(
        "/auth/logout",
        headers={"Cookie": f"refresh_token={rt_v2}"},
    )
    assert logout_resp.status_code == 200
    assert logout_resp.json() == {"ok": True}

    # --- Шаг 7: RT_v2 после logout должен быть отклонен ---
    post_logout_resp = await client.post(
        "/auth/refresh",
        headers={"Cookie": f"refresh_token={rt_v2}"},
    )
    assert post_logout_resp.status_code == 401, (
        "RT после logout должен быть отклонен"
    )

    # --- Шаг 8: проверяем состояние БД напрямую ---
    # Оба RT должны быть помечены revoked=True
    result = await db_session.execute(
        select(RefreshToken).where(RefreshToken.token.in_([rt_v1, rt_v2]))
    )
    rt_rows = result.scalars().all()
    assert len(rt_rows) == 2, "В БД должны быть оба RT"
    for row in rt_rows:
        assert row.revoked is True, f"RT id={row.id} должен быть revoked=True"
