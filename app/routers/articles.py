from typing import AsyncGenerator, Any
import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_db_session
from app.infrastructure.postgres_article_repo import PostgresArticleRepository
from app.infrastructure.scopus_client import ScopusHTTPClient
from app.models.user import User
from app.routers.users import get_current_user
from app.schemas.article_schemas import (
    ArticleResponse,
    PaginatedArticleResponse,
    StatsResponse,
    CountByField,
)
from app.services.article_service import ArticleService
from app.services.search_service import SearchService

router = APIRouter(prefix="/articles", tags=["Articles"])


def get_article_service(session: AsyncSession = Depends(get_db_session)) -> ArticleService:
    repo = PostgresArticleRepository(session)
    return ArticleService(article_repo=repo)


async def get_scopus_client() -> AsyncGenerator[ScopusHTTPClient, None]:
    # Один httpx.AsyncClient на запрос — создается и закрывается через async with
    async with httpx.AsyncClient(timeout=30.0) as client:
        yield ScopusHTTPClient(client)


def get_search_service(
    session: AsyncSession = Depends(get_db_session),
    scopus_client: ScopusHTTPClient = Depends(get_scopus_client),
) -> SearchService:
    repo = PostgresArticleRepository(session)
    return SearchService(search_client=scopus_client, article_repo=repo)


@router.get("/stats", response_model=StatsResponse, tags=["Analytics"])
async def get_stats(
    service: ArticleService = Depends(get_article_service),
) -> StatsResponse:
    # Публичный эндпоинт — JWT не требуется
    # Возвращает агрегаты только по сидированным статьям (is_seeded=True)
    data = await service.get_stats()
    return StatsResponse(
        total_articles=data["total_articles"],
        total_journals=data["total_journals"],
        total_countries=data["total_countries"],
        open_access_count=data["open_access_count"],
        by_year=[CountByField(**r) for r in data["by_year"]],
        by_journal=[CountByField(**r) for r in data["by_journal"]],
        by_country=[CountByField(**r) for r in data["by_country"]],
        by_doc_type=[CountByField(**r) for r in data["by_doc_type"]],
        top_keywords=[CountByField(**r) for r in data["top_keywords"]],
    )


@router.get("/", response_model=PaginatedArticleResponse)
async def get_articles(
    page: int = Query(1, ge=1, description="Номер страницы"),
    size: int = Query(10, ge=1, le=100, description="Количество статей на странице"),
    keyword: str | None = Query(None, min_length=2, description="Фильтр по ключевому слову сидера (точное совпадение)"),
    service: ArticleService = Depends(get_article_service),
) -> PaginatedArticleResponse:
    return await service.get_articles_paginated(page=page, size=size, keyword=keyword)


@router.get("/find", response_model=list[ArticleResponse])
async def find_articles(
    response: Response,
    keyword: str = Query(..., min_length=2, description="Ключевое слово для поиска"),
    count: int = Query(25, ge=1, le=25, description="Сколько статей запросить из Scopus (макс 25)"),
    service: SearchService = Depends(get_search_service),
    current_user: User = Depends(get_current_user),
) -> Any:
    # Второй Depends(get_scopus_client) убран: он создавал отдельный httpx.AsyncClient,
    # который FastAPI закрывал раньше, чем SearchService успевал им воспользоваться.
    # Теперь единственный клиент живет внутри get_search_service на всё время запроса.
    articles = await service.find_and_save(keyword, count=count)

    # Пробрасываем rate-limit заголовки Scopus в ответ.
    # isinstance-проверка явно документирует зависимость от конкретной реализации
    # и не нарушает контракт интерфейса ISearchClient (принцип LSP).
    sc = service.search_client
    if isinstance(sc, ScopusHTTPClient):
        if sc.last_rate_limit is not None:
            response.headers["X-RateLimit-Limit"] = sc.last_rate_limit
        if sc.last_rate_remaining is not None:
            response.headers["X-RateLimit-Remaining"] = sc.last_rate_remaining
        if sc.last_rate_reset is not None:
            response.headers["X-RateLimit-Reset"] = sc.last_rate_reset

    return [ArticleResponse.model_validate(a) for a in articles]


@router.get("/{article_id}", response_model=ArticleResponse)
async def get_article_by_id(
    article_id: int,
    service: ArticleService = Depends(get_article_service),
) -> ArticleResponse:
    # Публичный эндпоинт — JWT не требуется (аналогично GET /articles/)
    # Объявлен последним: /{article_id} не перехватывает /stats, /find, /
    article = await service.get_by_id(article_id)
    if article is None:
        raise HTTPException(status_code=404, detail="Article not found")
    return article
