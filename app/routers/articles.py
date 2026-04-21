import datetime
from datetime import timezone, timedelta
from typing import AsyncGenerator, Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status, Response
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_db_session
from app.infrastructure.postgres_article_repo import PostgresArticleRepository
from app.infrastructure.postgres_search_history_repo import PostgresSearchHistoryRepository
from app.infrastructure.scopus_client import ScopusHTTPClient
from app.interfaces.search_client import ISearchClient
from app.models.user import User
from app.routers.users import get_current_user
from app.schemas.article_schemas import (
    ArticleResponse,
    PaginatedArticleResponse,
    SearchStatsResponse,
    StatsResponse,
    CountByField,
)
from app.schemas.search_history_schemas import QuotaResponse, SearchHistoryResponse
from app.services.article_service import ArticleService
from app.services.search_history_service import SearchHistoryService
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
    article_repo = PostgresArticleRepository(session)
    history_repo = PostgresSearchHistoryRepository(session)
    return SearchService(
        search_client=scopus_client,
        article_repo=article_repo,
        history_repo=history_repo,
    )


def get_search_history_service(
    session: AsyncSession = Depends(get_db_session),
) -> SearchHistoryService:
    # Фабрика зависимости: создаем репозиторий и сервис за жизнью одного HTTP-запроса
    repo = PostgresSearchHistoryRepository(session)
    return SearchHistoryService(history_repo=repo)


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
    keyword: str | None = Query(
        None, min_length=2,
        description="Фильтр по ключевому слову сидера (точное совпадение)",
    ),
    search: str | None = Query(
        None, min_length=2,
        description="Fulltext-поиск по названию и первому автору (ILIKE, без учета регистра)",
    ),
    service: ArticleService = Depends(get_article_service),
) -> PaginatedArticleResponse:
    return await service.get_articles_paginated(
        page=page, size=size, keyword=keyword, search=search
    )


@router.get("/search/stats", response_model=SearchStatsResponse, tags=["Analytics"])
async def get_search_stats(
    search: str = Query(
        ..., min_length=2,
        description="Поисковый запрос — возвращает агрегаты только по matching статьям (ILIKE по title/author)",
    ),
    service: ArticleService = Depends(get_article_service),
    current_user: User = Depends(get_current_user),  # приватный: JWT обязателен
) -> SearchStatsResponse:
    # Приватный эндпоинт — агрегаты по пользовательскому поиску для Tremor-дашборда
    # Зарегистрирован строго до /{article_id} — иначе FastAPI матчит 'search' как int и вернет 422
    data = await service.get_search_stats(search)
    return SearchStatsResponse(
        total=data["total"],
        by_year=[CountByField(**r) for r in data["by_year"]],
        by_journal=[CountByField(**r) for r in data["by_journal"]],
        by_country=[CountByField(**r) for r in data["by_country"]],
        by_doc_type=[CountByField(**r) for r in data["by_doc_type"]],
    )


# Константы квоты — синхронизированы с SearchHistoryService
_QUOTA_LIMIT = 200
_WINDOW_DAYS = 7


@router.get("/find", response_model=list[ArticleResponse])
async def find_articles(
    response: Response,
    keyword: str = Query(..., min_length=2, description="Ключевое слово для поиска"),
    count: int = Query(25, ge=1, le=25, description="Сколько статей запросить из Scopus (макс 25)"),
    year_from: int | None = Query(None, description="Фильтр: год публикации от"),
    year_to: int | None = Query(None, description="Фильтр: год публикации до"),
    doc_types: list[str] | None = Query(None, description="Фильтр: типы документов"),
    open_access: bool | None = Query(None, description="Фильтр: только open-access"),
    country: list[str] | None = Query(None, description="Фильтр: страны"),
    service: SearchService = Depends(get_search_service),
    session: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> Any:
    # Собираем payload фильтров только из непустых значений
    filters_payload: dict = {}
    if year_from is not None:
        filters_payload["year_from"] = year_from
    if year_to is not None:
        filters_payload["year_to"] = year_to
    if doc_types is not None:
        filters_payload["doc_types"] = doc_types
    if open_access is not None:
        filters_payload["open_access"] = open_access
    if country is not None:
        filters_payload["country"] = country

    # Advisory-lock на уровне транзакции сериализует параллельные проверки квоты
    # одного пользователя (разные пользователи блокируют разные ключи).
    # SQLite такую функцию не поддерживает — ограничиваем вызов диалектом PG.
    if session.bind and session.bind.dialect.name == "postgresql":
        await session.execute(
            text('SELECT pg_advisory_xact_lock(:uid)'),
            {'uid': int(current_user.id)},
        )

    # Проверяем квоту в том же запросе/транзакции после advisory-lock
    since = datetime.datetime.now(tz=timezone.utc) - timedelta(days=_WINDOW_DAYS)
    used = await service.history_repo.count_in_window(
        user_id=int(current_user.id),
        since=since,
    )
    if used >= _QUOTA_LIMIT:
        raise HTTPException(
            status_code=429,
            detail="Недельный лимит поиска исчерпан",
        )

    articles = await service.find_and_save(
        keyword,
        count=count,
        user_id=int(current_user.id),
        filters=filters_payload or None,
    )

    # Пробрасываем rate-limit заголовки Scopus в ответ
    sc = service.search_client
    if isinstance(sc, ISearchClient):
        if sc.last_rate_limit is not None:
            response.headers["X-RateLimit-Limit"] = sc.last_rate_limit
        if sc.last_rate_remaining is not None:
            response.headers["X-RateLimit-Remaining"] = sc.last_rate_remaining
        if sc.last_rate_reset is not None:
            response.headers["X-RateLimit-Reset"] = sc.last_rate_reset

    return [ArticleResponse.model_validate(a) for a in articles]


@router.get("/history", response_model=SearchHistoryResponse)
async def get_search_history(
    n: int = Query(100, ge=1, le=100, description="Количество последних записей истории"),
    service: SearchHistoryService = Depends(get_search_history_service),
    current_user: User = Depends(get_current_user),
) -> SearchHistoryResponse:
    # Приватный эндпоинт: возвращает последние n записей истории текущего пользователя
    # Зарегистрирован строго до /{article_id} — 'history' не должно матчиться как int
    return await service.get_history(current_user.id, n)


@router.get("/find/quota", response_model=QuotaResponse)
async def get_find_quota(
    service: SearchHistoryService = Depends(get_search_history_service),
    current_user: User = Depends(get_current_user),
) -> QuotaResponse:
    # Приватный эндпоинт: состояние недельной квоты текущего пользователя
    # /find/quota зарегистрирован до /{article_id}: литеральный путь всегда прецедентнее catch-all
    return await service.get_quota(current_user.id)


@router.get("/{article_id}", response_model=ArticleResponse)
async def get_article_by_id(
    article_id: int,
    service: ArticleService = Depends(get_article_service),
) -> ArticleResponse:
    # Публичный эндпоинт — JWT не требуется
    # Всегда последним: /{article_id} матчит любой path-сегмент
    article = await service.get_by_id(article_id)
    if article is None:
        raise HTTPException(status_code=404, detail="Article not found")
    return article
