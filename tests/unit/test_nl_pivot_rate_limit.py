"""Юнит-тесты enforce_nl_pivot_rate_limit (docs/ai-nl-pivot/spec.md §1).

FakeRedis — лёгкий in-memory дублёр UpstashRedisClient.incr_with_ttl, тот же
принцип, что FakeRedis в tests/unit/test_catalog_service.py (управляемое
состояние вместо реального Upstash).
"""

import pytest
from fastapi import HTTPException

from app.config import settings
from app.core import nl_pivot_rate_limit as rl_module
from app.core.nl_pivot_rate_limit import enforce_nl_pivot_rate_limit


class FakeRedis:
    """Дублёр UpstashRedisClient с одним методом, нужным rate-limit'у."""

    def __init__(self) -> None:
        self.counters: dict[str, int] = {}
        self.calls: list[str] = []

    async def incr_with_ttl(self, key: str, ttl_seconds: int) -> int:
        self.calls.append(key)
        self.counters[key] = self.counters.get(key, 0) + 1
        return self.counters[key]


@pytest.fixture(autouse=True)
def _small_limits(monkeypatch: pytest.MonkeyPatch):
    # Детерминированные маленькие лимиты — не завязываемся на реальные placeholder-значения
    # из app/config.py (§0/§1 спеки: они сознательно калибруются позже).
    monkeypatch.setattr(settings, "NL_PIVOT_USER_DAILY_LIMIT", 2)
    monkeypatch.setattr(settings, "NL_PIVOT_GLOBAL_DAILY_LIMIT", 3)


@pytest.mark.asyncio
async def test_allows_request_under_both_limits(monkeypatch: pytest.MonkeyPatch):
    fake = FakeRedis()
    monkeypatch.setattr(rl_module, "redis_client", fake)

    await enforce_nl_pivot_rate_limit(user_id=1)  # не должно бросить исключение

    assert len(fake.calls) == 2  # user, затем global


@pytest.mark.asyncio
async def test_user_limit_exceeded_returns_429_without_touching_global(monkeypatch: pytest.MonkeyPatch):
    fake = FakeRedis()
    monkeypatch.setattr(rl_module, "redis_client", fake)

    await enforce_nl_pivot_rate_limit(user_id=1)  # user_count=1
    await enforce_nl_pivot_rate_limit(user_id=1)  # user_count=2 (лимит=2, ещё ок)

    with pytest.raises(HTTPException) as exc_info:
        await enforce_nl_pivot_rate_limit(user_id=1)  # user_count=3 > 2

    assert exc_info.value.status_code == 429
    assert "пользовател" in exc_info.value.detail.lower()
    # user-счётчик инкрементирован 3 раза, global — только 2 (запросы, прошедшие user-проверку)
    global_calls = [k for k in fake.calls if k.startswith("nl-pivot:global:")]
    user_calls = [k for k in fake.calls if k.startswith("nl-pivot:user:")]
    assert len(user_calls) == 3
    assert len(global_calls) == 2


@pytest.mark.asyncio
async def test_global_limit_exceeded_still_consumes_user_quota(monkeypatch: pytest.MonkeyPatch):
    fake = FakeRedis()
    monkeypatch.setattr(rl_module, "redis_client", fake)

    # 3 разных пользователя исчерпывают общий бюджет (global limit=3), у каждого свой user-лимит=2
    await enforce_nl_pivot_rate_limit(user_id=1)
    await enforce_nl_pivot_rate_limit(user_id=2)
    await enforce_nl_pivot_rate_limit(user_id=3)  # global_count=3, ещё ок (лимит=3)

    with pytest.raises(HTTPException) as exc_info:
        await enforce_nl_pivot_rate_limit(user_id=4)  # global_count=4 > 3, хотя user_id=4 свежий

    assert exc_info.value.status_code == 429
    assert "попробуйте завтра" in exc_info.value.detail.lower()
    # user-счётчик для user_id=4 всё равно инкрементирован — порядок user-первым-затем-global
    # (принятый trade-off, §1 спеки), несмотря на то что запрос в итоге отклонён по global.
    user_4_suffix = ":4:" + _today()
    user_calls_for_user_4 = [k for k in fake.calls if k.startswith("nl-pivot:user:") and k.endswith(user_4_suffix)]
    assert len(user_calls_for_user_4) == 1


@pytest.mark.asyncio
async def test_redis_unavailable_returns_503(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(rl_module, "redis_client", None)

    with pytest.raises(HTTPException) as exc_info:
        await enforce_nl_pivot_rate_limit(user_id=1)

    assert exc_info.value.status_code == 503


def _today() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).date().isoformat()
