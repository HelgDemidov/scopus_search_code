print("[main] Module loading started", flush=True)

from contextlib import asynccontextmanager
from typing import AsyncGenerator
import traceback

import httpx
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.sessions import SessionMiddleware

from app.config import settings
from app.routers import articles, users, health
from app.routers import auth
from app.routers.seeder_router import router as seeder_router

print("[main] All imports complete", flush=True)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    # --- STARTUP: создаем глобальный HTTP-клиент для Scopus ---
    print("[main] Application startup: initializing HTTP client", flush=True)
    app.state.http_client = httpx.AsyncClient()
    print("[main] Application startup complete — ready to serve requests", flush=True)
    yield
    # --- SHUTDOWN: корректно закрываем TCP-соединения ---
    print("[main] Application shutdown: closing HTTP client", flush=True)
    await app.state.http_client.aclose()
    print("[main] Application shutdown complete", flush=True)


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


@app.middleware("http")
async def log_requests(request: Request, call_next):
    print(f"[main] Incoming request: {request.method} {request.url.path}", flush=True)
    try:
        response = await call_next(request)
        print(f"[main] Request completed: {request.method} {request.url.path} -> {response.status_code}", flush=True)
        return response
    except Exception as exc:
        print(f"[main] Unhandled exception in middleware for {request.method} {request.url.path}: {exc}", flush=True)
        print(traceback.format_exc(), flush=True)
        raise


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    print(f"[main] Unhandled exception caught by exception handler: {type(exc).__name__}: {exc}", flush=True)
    print(traceback.format_exc(), flush=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error", "type": type(exc).__name__},
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    # Фильтруем поле `input` из ошибок Pydantic — оно содержит оригинальные данные запроса
    # включая пароли и другие чувствительные поля, которые не должны попасть в логи/мониторинг
    return JSONResponse(
        status_code=422,
        content={"detail": [
            {"loc": e["loc"], "msg": e["msg"], "type": e["type"]}
            for e in exc.errors()
        ]},
    )


# Подключаем роутеры
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(articles.router)
app.include_router(health.router)
app.include_router(seeder_router)

@app.get("/", tags=["Health"])
async def root() -> dict[str, str]:
    print("[main] Root endpoint called", flush=True)
    return {"status": "ok", "message": "Scopus Search API is running"}
