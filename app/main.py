from contextlib import asynccontextmanager
from typing import AsyncGenerator

import httpx
import structlog
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.sessions import SessionMiddleware

from app.config import settings
from app.core.logging_config import REQUEST_ID_HEADER, RequestIDMiddleware, configure_logging
from app.core.sentry_config import configure_sentry
from app.routers import articles, auth, health, users
from app.routers.seeder_router import router as seeder_router

configure_logging()
configure_sentry()
logger = structlog.get_logger("app.error")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    # --- STARTUP: создаем глобальный HTTP-клиент для Scopus ---
    app.state.http_client = httpx.AsyncClient()
    yield
    # --- SHUTDOWN: корректно закрываем TCP-соединения ---
    await app.state.http_client.aclose()


app = FastAPI(
    title="Scopus Search API",
    description="Веб-сервис для поиска научных публикаций через Scopus API",
    version="1.0.0",
    lifespan=lifespan,
)

# SessionMiddleware должна быть ДО CORSMiddleware
# Она подписывает OAuth state в cookie, защищая от CSRF
app.add_middleware(SessionMiddleware, secret_key=settings.SESSION_SECRET_KEY)

# CORS: используем явный список origins вместо wildcard
# allow_origins=["*"] + allow_credentials=True — невалидная комбинация по спецификации CORS
# Браузер блокирует такие запросы на уровне preflight — никакие credentials не проходят
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,  # читаем из ALLOWED_ORIGINS, фоллбэк — FRONTEND_URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Внешний слой — видит запрос первым, ответ последним (Starlette: последний
# add_middleware — самый внешний), значит request_id доступен для всех логов запроса
app.add_middleware(RequestIDMiddleware)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    # Фильтруем поле `input` из ошибок Pydantic — оно содержит оригинальные данные запроса
    # включая пароли и другие чувствительные поля, которые не должны попасть в логи/мониторинг
    return JSONResponse(
        status_code=422,
        content={"detail": [{"loc": e["loc"], "msg": e["msg"], "type": e["type"]} for e in exc.errors()]},
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    # Ловит всё, что не поймано более специфичным handler'ом (HTTPException — исключение,
    # у него свой handler выше по MRO). Traceback — только в лог, не в тело ответа клиенту.
    # Starlette специально выносит handler голого Exception в ServerErrorMiddleware —
    # он стоит ВЫШЕ RequestIDMiddleware, поэтому X-Request-ID сюда не долетает через
    # response.headers в middleware и его нужно достать из contextvars и проставить здесь.
    request_id = structlog.contextvars.get_contextvars().get("request_id")
    logger.error(
        "unhandled_exception",
        method=request.method,
        path=request.url.path,
        exc_info=(type(exc), exc, exc.__traceback__),
    )
    response = JSONResponse(status_code=500, content={"detail": "Internal server error"})
    if request_id:
        response.headers[REQUEST_ID_HEADER] = request_id
    return response


# Подключаем роутеры
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(articles.router)
app.include_router(health.router)
app.include_router(seeder_router)


@app.get("/", tags=["Health"])
async def root() -> dict[str, str]:
    return {"status": "ok", "message": "Scopus Search API is running"}
