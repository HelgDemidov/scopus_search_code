# app/routers/articles.py
print("[articles] Router module loading", flush=True)

import datetime
from datetime import timezone, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status, Response
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import (
    get_catalog_service,
    get_db_session,
    get_current_user,
    get_optional_current_user,
    get_search_service,
    get_search_history_service,
)
from app.infrastructure.postgres_search_result_repo import PostgresSearchResultRepository
from app.models.search_history import SearchHistory
from app.models.user import User
from app.schemas.article_schemas import (
    ArticleResponse,
    CountByField,
    PaginatedArticleResponse,
    SearchStatsResponse,
    StatsResponse,
)
from app.schemas.search_history_schemas import (
    QuotaResponse,
    SearchHistoryResponse,
    SearchResultsResponse,
)
from app.services.article_service import ArticleService
from app.services.catalog_service import CatalogService
from app.services.search_history_service import SearchHistoryService
from app.services.search_service import SearchService
from app.interfaces.search_client import ISearchClient

router = APIRouter(prefix="/articles", tags=["Articles"])


# Фабрика ArticleService остается локальной — сервис нужен только здесь
# и требует отдельной сессии, не смешанной с CatalogService
def _get_article_service(
    session: AsyncSession = Depends(get_db_session),
) -> "ArticleService":
    from app.infrastructure.postgres_article_repo import PostgresArticleRepository
    return ArticleService(article_repo=PostgresArticleRepository(session))


def _get_search_result_repo(
    session: AsyncSession = Depends(get_db_session),
) -> PostgresSearchResultRepository:
    # Репозиторий результатов нужен напрямую для get_search_stats_for_user
    # и get_results_by_history_id — SearchService не предоставляет этих методов
    return PostgresSearchResultRepository(session)


# Константа квоты — единственный источник правды, остальное живёт в SearchHistoryService
_WINDOW_DAYS = 7


# ------------------------------------------------------------------ #
#  GET /stats — публичный, без JWT                                    #
# ------------------------------------------------------------------ #

@router.get("/stats", response_model=StatsResponse, tags=["Analytics"])
async def get_stats(
    service: CatalogService = Depends(get_catalog_service),
) -> StatsResponse:
    # CatalogService.get_stats() возвращает готовый StatsResponse — разворот dict→Pydantic не нужен
    return await service.get_stats()


# ------------------------------------------------------------------ #
#  GET / — публичный, без JWT                                         #
# ------------------------------------------------------------------ #

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
    service: CatalogService = Depends(get_catalog_service),
) -> PaginatedArticleResponse:
    return await service.get_catalog_paginated(
        page=page, size=size, keyword=keyword, search=search
    )


# ------------------------------------------------------------------ #
#  GET /search/stats — приватный, JWT обязателен                      #
# ------------------------------------------------------------------ #

@router.get("/search/stats", response_model=SearchStatsResponse, tags=["Analytics"])
async def get_search_stats(
    search: str = Query(
        ..., min_length=2,
        description="Поисковый запрос — агрегаты по matching статьям из поисков пользователя",
    ),
    result_repo: PostgresSearchResultRepository = Depends(_get_search_result_repo),
    current_user: User = Depends(get_current_user),
) -> SearchStatsResponse:
    # Приватный эндпоинт — агрегаты по статьям из поисков текущего пользователя
    # Зарегистрирован строго до /{article_id} — иначе FastAPI матчит 'search' как int → 422
    data = await result_repo.get_search_stats_for_user(
        user_id=int(current_user.id),
        search=search,
    )
    return SearchStatsResponse(
        total=data["total"],
        by_year=[CountByField(label=str(r["year"]), count=r["count"]) for r in data["by_year"]],
        by_journal=[CountByField(label=r["journal"], count=r["count"]) for r in data["by_journal"]],
        by_country=[CountByField(label=r["country"], count=r["count"]) for r in data["by_country"]],
        by_doc_type=[CountByField(label=r["doc_type"], count=r["count"]) for r in data["by_doc_type"]],
    )


# ------------------------------------------------------------------ #
#  GET /find — приватный, JWT обязателен                              #
# ------------------------------------------------------------------ #

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
    history_service: SearchHistoryService = Depends(get_search_history_service),
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
    # одного пользователя. SQLite такую функцию не поддерживает — ограничиваем PG.
    if session.bind and session.bind.dialect.name == "postgresql":
        await session.execute(
            text("SELECT pg_advisory_xact_lock(:uid)"),
            {"uid": int(current_user.id)},
        )

    # Квотная проверка через SearchHistoryService — не читаем репо напрямую из роутера
    quota = await history_service.get_quota(current_user.id)
    if quota.remaining <= 0:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Недельный лимит поиска исчерпан",
        )

    articles = await service.find_and_save(
        keyword,
        count=count,
        user_id=int(current_user.id),
        filters=filters_payload or None,
    )

    # Пробрасываем rate-limit заголовки Scopus API в ответ
    sc = service.search_client
    if isinstance(sc, ISearchClient):
        if sc.last_rate_limit is not None:
            response.headers["X-RateLimit-Limit"] = sc.last_rate_limit
        if sc.last_rate_remaining is not None:
            response.headers["X-RateLimit-Remaining"] = sc.last_rate_remaining
        if sc.last_rate_reset is not None:
            response.headers["X-RateLimit-Reset"] = sc.last_rate_reset

    return [ArticleResponse.model_validate(a) for a in articles]


# ------------------------------------------------------------------ #
#  GET /find/quota — приватный, JWT обязателен                        #
# ------------------------------------------------------------------ #

@router.get("/find/quota", response_model=QuotaResponse)
async def get_find_quota(
    service: SearchHistoryService = Depends(get_search_history_service),
    current_user: User = Depends(get_current_user),
) -> QuotaResponse:
    # Приватный эндпоинт: состояние недельной квоты текущего пользователя
    # /find/quota зарегистрирован до /{article_id}: литеральный путь прецедентнее catch-all
    return await service.get_quota(current_user.id)


# ------------------------------------------------------------------ #
#  GET /history — приватный, JWT обязателен                           #
# ------------------------------------------------------------------ #

@router.get("/history", response_model=SearchHistoryResponse)
async def get_search_history(
    n: int = Query(100, ge=1, le=100, description="Количество последних записей истории"),
    service: SearchHistoryService = Depends(get_search_history_service),
    current_user: User = Depends(get_current_user),
) -> SearchHistoryResponse:
    # Приватный эндпоинт: последние n записей истории текущего пользователя
    # Зарегистрирован строго до /{article_id}
    return await service.get_history(current_user.id, n)


# ------------------------------------------------------------------ #
#  GET /history/{search_id}/results — приватный, JWT обязателен       #
# ------------------------------------------------------------------ #

@router.get("/history/{search_id}/results", response_model=SearchResultsResponse)
async def get_search_results(
    search_id: int,
    result_repo: PostgresSearchResultRepository = Depends(_get_search_result_repo),
    session: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> SearchResultsResponse:
    # Ownership-проверка встроена в get_results_by_history_id:
    # возвращает None если search_id не найден или принадлежит другому пользователю
    articles = await result_repo.get_results_by_history_id(
        search_history_id=search_id,
        user_id=int(current_user.id),
    )
    if articles is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="История поиска не найдена",
        )

    # Отдельный SELECT за query — ISearchHistoryRepository.get_by_id не существует,
    # используем session напрямую. Это единственное исключение из правила «не писать SQL в роутере»:
    # добавлять get_by_id в интерфейс ради одного поля query означало бы расширять контракт
    # только ради представления, что нарушает принцип минимальности интерфейса (ISP).
    history_row = await session.get(SearchHistory, search_id)
    if history_row is None:
    # Инвариант нарушен: статьи есть, но запись истории исчезла — ошибка БД
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Внутренняя ошибка: запись истории не найдена",
        )

    return SearchResultsResponse(
        search_id=search_id,
        query=history_row.query,
        created_at=history_row.created_at,
        articles=[ArticleResponse.model_validate(a) for a in articles],
        total=len(articles),
    )


# ------------------------------------------------------------------ #
#  GET /{article_id} — публичный, JWT опционален                      #
# ------------------------------------------------------------------ #

@router.get("/{article_id}", response_model=ArticleResponse)
async def get_article_by_id(
    article_id: int,
    service: "ArticleService" = Depends(_get_article_service),
    current_user: User | None = Depends(get_optional_current_user),
) -> ArticleResponse:
    # Публичный эндпоинт: JWT не обязателен, но если передан — учитывается видимость
    # из поисков пользователя (ArticleService.get_by_id с user_id). Всегда последним:
    # /{article_id} матчит любой path-сегмент — литеральные пути должны быть выше.
    user_id = int(current_user.id) if current_user else None
    article = await service.get_by_id(article_id, user_id=user_id)
    if article is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Article not found")
    return article