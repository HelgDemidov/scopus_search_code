# tests/unit/test_sentry_config.py
import pytest

from app.core.sentry_config import _strip_query_string, configure_sentry


def test_configure_sentry_calls_init_with_expected_kwargs(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: dict = {}

    def fake_init(**kwargs: object) -> None:
        calls.update(kwargs)

    monkeypatch.setattr("app.core.sentry_config.sentry_sdk.init", fake_init)
    monkeypatch.setattr("app.core.sentry_config.settings.SENTRY_DSN", "https://key@o0.ingest.de.sentry.io/1")
    monkeypatch.setattr("app.core.sentry_config.settings.RAILWAY_ENVIRONMENT_NAME", "staging")
    monkeypatch.setattr("app.core.sentry_config.settings.SENTRY_TRACES_SAMPLE_RATE", 1.0)

    configure_sentry()

    assert calls["dsn"] == "https://key@o0.ingest.de.sentry.io/1"
    assert calls["environment"] == "staging"
    assert calls["traces_sample_rate"] == 1.0
    assert calls["send_default_pii"] is False
    assert calls["before_send"] is _strip_query_string
    assert calls["before_send_transaction"] is _strip_query_string


def test_configure_sentry_no_op_dsn_still_calls_init(monkeypatch: pytest.MonkeyPatch) -> None:
    """dsn=None — SDK неактивен, но init() всё равно вызывается (no-op по контракту SDK)."""
    calls: dict = {}
    monkeypatch.setattr("app.core.sentry_config.sentry_sdk.init", lambda **kwargs: calls.update(kwargs))
    monkeypatch.setattr("app.core.sentry_config.settings.SENTRY_DSN", None)

    configure_sentry()

    assert calls["dsn"] is None


def test_strip_query_string_removes_query_params() -> None:
    event = {"request": {"url": "https://api.example.com/auth/google/callback?code=abc&state=xyz"}}
    result = _strip_query_string(event, {})
    assert result["request"]["url"] == "https://api.example.com/auth/google/callback"


def test_strip_query_string_leaves_url_without_query_unchanged() -> None:
    event = {"request": {"url": "https://api.example.com/health"}}
    result = _strip_query_string(event, {})
    assert result["request"]["url"] == "https://api.example.com/health"


def test_strip_query_string_handles_missing_request_key() -> None:
    event: dict = {"message": "boom"}
    result = _strip_query_string(event, {})
    assert result == {"message": "boom"}


def test_strip_query_string_handles_missing_url_key() -> None:
    event = {"request": {"method": "GET"}}
    result = _strip_query_string(event, {})
    assert result == {"request": {"method": "GET"}}
