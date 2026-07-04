"""Регрессионные тесты на баг 2026-07-05: get_optional_current_user тихо трактовал
невалидный/истёкший токен как анонимный доступ (return None) вместо 401, из-за чего
фронтендовый silent-refresh (реагирует только на реальный 401) никогда не срабатывал
для GET /articles/{id} — залогиненный пользователь с истёкшим AT молча терял видимость
собственных статей из личных поисков (postgres_article_repo.get_by_id: user_id=None
→ catalog-only видимость).

Три сценария по контракту:
  - token=None (анонимный визит)      → None, без исключения
  - token есть, но невалиден/истёк    → HTTPException 401 (было: None)
  - token валиден                     → делегирование UserService.get_current_user
"""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

from app.core.dependencies import get_optional_current_user
from app.models.user import User


class _FakeUserService:
    def __init__(self, user: User | None) -> None:
        self.get_current_user = AsyncMock(return_value=user)


@pytest.mark.asyncio
async def test_no_token_returns_none_without_raising():
    result = await get_optional_current_user(token=None, service=_FakeUserService(None))
    assert result is None


@pytest.mark.asyncio
async def test_invalid_token_raises_401_not_silent_none(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr("app.core.dependencies.decode_access_token", lambda _token: None)

    with pytest.raises(HTTPException) as exc_info:
        await get_optional_current_user(token="garbage-or-expired-jwt", service=_FakeUserService(None))

    assert exc_info.value.status_code == 401


@pytest.mark.asyncio
async def test_valid_token_delegates_to_user_service(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr("app.core.dependencies.decode_access_token", lambda _token: "user@example.com")
    fake_user = User(id=1, email="user@example.com", hashed_password="x")
    service = _FakeUserService(fake_user)

    result = await get_optional_current_user(token="valid-jwt", service=service)

    assert result is fake_user
    service.get_current_user.assert_awaited_once_with("user@example.com")
