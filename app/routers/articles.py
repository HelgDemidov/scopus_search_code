from typing import AsyncGenerator
import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status, Response
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Any

from app.core.dependencies import get_db_session
from app.infrastructure.postgres_article_repo import PostgresArticleRepository
from app.infrastructure.scopus_client import ScopusHTTPClient
from app.models.user import User  # если нужна типизация current_user
from app.routers.users import get_current_user
from app.schemas.article_schemas import ArticleResponse, PaginatedArticleResponse
from app.services.article_service import ArticleService
from app.services.search_service import SearchService

router = APIRouter(prefix="/articles", tags=["Articles"])


def get_article_service(session: AsyncSession = Depends(get_db_session)) -> ArticleService:
    repo = PostgresArticleRepository(session)
    return ArticleService(article_repo=repo)

async def get_scopus_client() -> AsyncGenerator[ScopusHTTPClient, None]: # <-- Изменение здесь
    async with httpx.AsyncClient(timeout=30.0) as client:
        yield ScopusHTTPClient(client)

def get_search_service(
    session: AsyncSession = Depends(get_db_session),
    scopus_client: ScopusHTTPClient = Depends(get_scopus_client),
) -> SearchService:
    repo = PostgresArticleRepository(session)
    return SearchService(search_client=scopus_client, article_repo=repo)


@router.get("/", response_model=PaginatedArticleResponse)
async def get_articles(
    page: int = Query(1, ge=1, description="Номер страницы"),
    size: int = Query(10, ge=1, le=100, description="Количество статей на странице"),
    service: ArticleService = Depends(get_article_service),
) -> PaginatedArticleResponse:
    return await service.get_articles_paginated(page=page, size=size)


@router.get("/find", response_model=list[ArticleResponse])
async def find_articles(
    response: Response,  
    keyword: str = Query(..., min_length=2, description="Ключевое слово для поиска"),
    count: int = Query(25, ge=1, le=25, description="Сколько статей запросить из Scopus (макс 25)"),
    service: SearchService = Depends(get_search_service),
    scopus_client: ScopusHTTPClient = Depends(get_scopus_client),
    current_user: User = Depends(get_current_user),
) -> Any:  # <-- ключевое изменение
    articles = await service.find_and_save(keyword, count=count)

    # Пробрасываем лимиты Scopus в заголовки ответа
    if scopus_client.last_rate_limit is not None:
        response.headers["X-RateLimit-Limit"] = scopus_client.last_rate_limit
    if scopus_client.last_rate_remaining is not None:
        response.headers["X-RateLimit-Remaining"] = scopus_client.last_rate_remaining
    if scopus_client.last_rate_reset is not None:
        response.headers["X-RateLimit-Reset"] = scopus_client.last_rate_reset

    return [ArticleResponse.model_validate(a) for a in articles]
    
    # Ищет статьи в Scopus по ключевому слову и сохраняет их в базу
    # Приватный эндпоинт: доступен только для авторизованных пользователей
    # current_user гарантированно существует и прошёл проверку токена
    
    try:
        articles = await service.find_and_save(keyword=keyword)
        return [ArticleResponse.model_validate(a) for a in articles]
    except httpx.HTTPStatusError as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Ошибка Scopus API: {e.response.status_code}",
        )
