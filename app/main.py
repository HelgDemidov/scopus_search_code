from contextlib import asynccontextmanager
from typing import AsyncGenerator

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
    return {"status": "ok", "message": "Scopus Search API is running"}
