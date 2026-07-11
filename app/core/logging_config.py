import logging
import time
import uuid
from collections.abc import Awaitable, Callable

import sentry_sdk
import structlog
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

REQUEST_ID_HEADER = "X-Request-ID"


def configure_logging() -> None:
    """JSON structured logging вместо сырого текстового stdout (issue #48).

    Railway уже показывает stdout как есть — с этой конфигурацией строки
    становятся parseable JSON вместо неструктурированного текста.
    """
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(logging.INFO),
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )


class RequestIDMiddleware(BaseHTTPMiddleware):
    """request_id (uuid4) в contextvars — попадает во все логи текущего запроса.

    Тот же id — в заголовке ответа X-Request-ID, для корреляции клиент↔логи.
    """

    async def dispatch(self, request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
        request_id = str(uuid.uuid4())
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(request_id=request_id)
        # Тот же id, что в JSON-логе и заголовке ответа — коррелирует Sentry-событие с логом
        sentry_sdk.set_tag("request_id", request_id)

        logger = structlog.get_logger("app.request")
        start = time.perf_counter()
        response = await call_next(request)
        duration_ms = round((time.perf_counter() - start) * 1000, 2)

        logger.info(
            "request_handled",
            method=request.method,
            path=request.url.path,
            status_code=response.status_code,
            duration_ms=duration_ms,
        )
        response.headers[REQUEST_ID_HEADER] = request_id
        return response
