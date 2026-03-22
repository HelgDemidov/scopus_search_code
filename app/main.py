from contextlib import asynccontextmanager
import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import users, articles


# --- LIFESPAN: управление жизненным циклом приложения ---
# asynccontextmanager превращает обычную async-функцию в менеджер контекста.
# FastAPI вызывает код ДО yield при старте, и код ПОСЛЕ yield при остановке.
@asynccontextmanager
async def lifespan(app: FastAPI):
    # --- STARTUP (выполняется один раз при запуске сервера) ---
    # Создаём один глобальный HTTP-клиент для всех запросов к Scopus.
    # Это гораздо эффективнее, чем создавать новое TCP-соединение на каждый запрос.
    app.state.http_client = httpx.AsyncClient()

    yield  # <- здесь приложение работает и обрабатывает запросы

    # --- SHUTDOWN (выполняется один раз при остановке сервера) ---
    # Корректно закрываем все открытые TCP-соединения, чтобы не было утечек.
    await app.state.http_client.aclose()


# --- СОЗДАНИЕ ПРИЛОЖЕНИЯ ---
# Передаём lifespan-функцию и метаданные для Swagger-документации.
app = FastAPI(
    title="Scopus Search API",
    description="Веб-сервис для поиска научных публикаций через Scopus API",
    version="1.0.0",
    lifespan=lifespan,
)


# --- CORS MIDDLEWARE ---
# CORS (Cross-Origin Resource Sharing) — браузерная защита.
# Без этого блока браузер заблокирует запросы с любого фронтенда к нашему API.
# allow_origins=["*"] разрешает запросы со всех доменов (подходит для разработки).
# В продакшне этот список нужно сузить до конкретных доменов.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- ПОДКЛЮЧЕНИЕ РОУТЕРОВ ---
# Регистрируем оба наших роутера в главном приложении.
# Теперь FastAPI знает о всех наших эндпоинтах и включит их в Swagger.
app.include_router(users.router)
app.include_router(articles.router)


# --- КОРНЕВОЙ ЭНДПОИНТ (Health Check) ---
# Простая проверка: если сервис жив, он ответит {"status": "ok"}.
# Используется в Docker и облачных деплоях для мониторинга.
@app.get("/", tags=["Health"])
async def root():
    return {"status": "ok", "message": "Scopus Search API is running"}
