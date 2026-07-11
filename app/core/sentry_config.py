import sentry_sdk
from sentry_sdk.types import Event, Hint

from app.config import settings


def _strip_query_string(event: Event, hint: Hint) -> Event | None:
    """Режет query-string из request.url перед отправкой в Sentry.

    send_default_pii=False НЕ защищает url.full (httpContextIntegration) — оно
    остаётся нефильтрованным независимо от флага. В проекте есть реальные URL
    с секретом в query-string (GET /auth/google/callback?code=...&state=...) —
    полагаться на дефолтный PII-скрабинг SDK для них нельзя.
    """
    request = event.get("request")
    if request is None:
        return event
    url = request.get("url")
    if isinstance(url, str):
        request["url"] = url.split("?", 1)[0]
    return event


def configure_sentry() -> None:
    sentry_sdk.init(
        dsn=settings.SENTRY_DSN,  # None/"" → SDK неактивен, все capture_* — no-op
        environment=settings.RAILWAY_ENVIRONMENT_NAME,
        traces_sample_rate=settings.SENTRY_TRACES_SAMPLE_RATE,
        send_default_pii=False,
        before_send=_strip_query_string,
        before_send_transaction=_strip_query_string,
    )
