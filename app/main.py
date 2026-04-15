from contextlib import asynccontextmanager
from typing import AsyncGenerator

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware

from app.config import settings
from app.routers import articles, users, health


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

# CORS: браузерная защита, разрешаем запросы с любого домена (allow_origins=["*"] для dev)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Подключаем роутеры
app.include_router(users.router)
app.include_router(articles.router)
app.include_router(health.router)


@app.get("/", tags=["Health"])
async def root() -> dict[str, str]:
    return {"status": "ok", "message": "Scopus Search API is running"}
