# app/core/dependencies.py
from typing import AsyncGenerator

import httpx
from fastapi import Depends
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_access_token, oauth2_scheme
from app.infrastructure.database import async_session_maker
from app.infrastructure.postgres_article_repo import PostgresArticleRepository
from app.infrastructure.postgres_catalog_repo import PostgresCatalogRepository
from app.infrastructure.postgres_search_history_repo import PostgresSearchHistoryRepository
from app.infrastructure.postgres_search_result_repo import PostgresSearchResultRepository
from app.infrastructure.postgres_user_repo import PostgresUserRepository
from app.infrastructure.scopus_client import ScopusHTTPClient
from app.models.user import User
from app.services.article_service import ArticleService
from app.services.catalog_service import CatalogService
from app.services.search_history_service import SearchHistoryService
from app.services.search_service import SearchService
from app.services.user_service import UserService

# Отдельная схема OAuth2 с auto_error=False — не бросает 401 при отсутствии токена
# Используется для эндпоинтов, где авторизация опциональна (например, GET /articles/{id})
_oauth2_scheme_optional = OAuth2PasswordBearer(
    tokenUrl="users/login",
    auto_error=False,
)


# ------------------------------------------------------------------ #
#  База: сессия БД                                                    #
# ------------------------------------------------------------------ #

async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    # Dependency: создает сессию БД на время одного запроса
    # yield — ключевое слово: FastAPI получит сессию, выполнит запрос,
    # потом автоматически закроет сессию в блоке finally
    print("[dependencies] get_db_session: acquiring DB session...", flush=True)
    async with async_session_maker() as session:
        print("[dependencies] get_db_session: session acquired, yielding to handler", flush=True)
        yield session
    print("[dependencies] get_db_session: session closed", flush=True)



# ------------------------------------------------------------------ #
#  Пользователи                                                       #
# ------------------------------------------------------------------ #

def get_user_service(
    session: AsyncSession = Depends(get_db_session),
) -> UserService:
    # Фабрика UserService — используется как в роутере users, так и в get_current_user
    return UserService(PostgresUserRepository(session))


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    service: UserService = Depends(get_user_service),
) -> User:
    # Обязательная JWT-аутентификация: бросает 401 если токен отсутствует или невалиден
    from fastapi import HTTPException, status
    email = decode_access_token(token)
    if not email:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Токен недействителен или истек",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user = await service.get_current_user(email)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Пользователь не найден",
        )
    return user


async def get_optional_current_user(
    token: str | None = Depends(_oauth2_scheme_optional),
    service: UserService = Depends(get_user_service),
) -> User | None:
    # Опциональная JWT-аутентификация: возвращает None если токен не передан
    # Используется для публичных эндпоинтов с опциональной видимостью (GET /articles/{id})
    if token is None:
        return None
    email = decode_access_token(token)
    if not email:
        return None
    return await service.get_current_user(email)


# ------------------------------------------------------------------ #
#  Scopus HTTP-клиент                                                 #
# ------------------------------------------------------------------ #

async def get_scopus_client() -> AsyncGenerator[ScopusHTTPClient, None]:
    # Один httpx.AsyncClient на запрос — создается и закрывается через async with
    async with httpx.AsyncClient(timeout=30.0) as client:
        yield ScopusHTTPClient(client)


# ------------------------------------------------------------------ #
#  Сервисы статей и каталога                                          #
# ------------------------------------------------------------------ #

def get_article_service(
    session: AsyncSession = Depends(get_db_session),
) -> ArticleService:
    return ArticleService(article_repo=PostgresArticleRepository(session))


def get_catalog_service(
    session: AsyncSession = Depends(get_db_session),
) -> CatalogService:
    return CatalogService(
        article_repo=PostgresArticleRepository(session),
        catalog_repo=PostgresCatalogRepository(session),
        session=session,
    )


# ------------------------------------------------------------------ #
#  Сервис пользовательского поиска                                    #
# ------------------------------------------------------------------ #

def get_search_service(
    session: AsyncSession = Depends(get_db_session),
    scopus_client: ScopusHTTPClient = Depends(get_scopus_client),
) -> SearchService:
    # Все 5 зависимостей конструктора SearchService собираются здесь
    return SearchService(
        search_client=scopus_client,
        article_repo=PostgresArticleRepository(session),
        history_repo=PostgresSearchHistoryRepository(session),
        search_result_repo=PostgresSearchResultRepository(session),
        session=session,
    )


# ------------------------------------------------------------------ #
#  Сервис истории поиска                                              #
# ------------------------------------------------------------------ #

def get_search_history_service(
    session: AsyncSession = Depends(get_db_session),
) -> SearchHistoryService:
    # Фабрика зависимости: создаем репозиторий и сервис за жизнью одного HTTP-запроса
    return SearchHistoryService(
        history_repo=PostgresSearchHistoryRepository(session),
    )