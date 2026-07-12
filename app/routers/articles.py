# app/routers/articles.py
import logging
from typing import Any, Callable

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import (
    get_advisory_lock_factory,
    get_catalog_service,
    get_current_user,
    get_db_session,
    get_nl_pivot_query_service,
    get_optional_current_user,
    get_search_history_service,
    get_search_service,
)
from app.core.nl_pivot_rate_limit import enforce_nl_pivot_rate_limit
from app.infrastructure.postgres_search_result_repo import PostgresSearchResultRepository
from app.interfaces.nl_pivot_parser import NlPivotParseError
from app.interfaces.search_client import ISearchClient
from app.models.search_history import SearchHistory
from app.models.user import User
from app.schemas.article_schemas import (
    ArticleResponse,
    CountByField,
    JournalImpactPoint,
    NlPivotQueryRequest,
    NlPivotQueryResponse,
    PaginatedArticleResponse,
    PersonalActivityResponse,
    PivotDimension,
    PivotMetric,
    PivotResponse,
    SearchStatsResponse,
    StatsResponse,
    validate_pivot_pair,
)
from app.schemas.search_history_schemas import (
    QuotaResponse,
    SearchHistoryResponse,
    SearchResultsResponse,
)
from app.services.article_service import ArticleService
from app.services.catalog_service import CatalogService
from app.services.nl_pivot_query_service import NlPivotQueryService, NlPivotValidationError
from app.services.search_history_service import SearchHistoryService
from app.services.search_service import SearchService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/articles", tags=["Articles"])


# ------------------------------------------------------------------ #
#  Advisory lock: перенесена в dependencies.py для DI-совместимости  #
# ------------------------------------------------------------------ #
# Используем get_advisory_lock_factory() через Depends() в find_articles.
# В продакшне → pg_advisory_lock; в SQLite-тестах → no-op из conftest.


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


_WINDOW_DAYS = 7  # единственный источник правды для квоты


# ------------------------------------------------------------------ #
#  GET /stats — публичный, без JWT                                    #
# ------------------------------------------------------------------ #


@router.get("/stats", response_model=StatsResponse, tags=["Analytics"])
async def get_stats(
    countries: list[str] | None = Query(None, description="Фильтр по странам аффилиации"),
    doc_types: list[str] | None = Query(None, description="Фильтр по типам документов"),
    open_access: bool | None = Query(None, description="True — только OA; False — только не-OA"),
    year_from: int | None = Query(None, ge=1900, le=2100, description="Год публикации >="),
    year_to: int | None = Query(None, ge=1900, le=2100, description="Год публикации <="),
    service: CatalogService = Depends(get_catalog_service),
) -> StatsResponse:
    return await service.get_stats(
        countries=countries,
        doc_types=doc_types,
        open_access=open_access,
        year_from=year_from,
        year_to=year_to,
    )


# ------------------------------------------------------------------ #
#  GET /stats/journal-impact — публичный, без JWT                     #
#  Journal Landscape Scatter (docs/explore-table-builder/spec.md §1)  #
#  Кэшируется (CatalogService.get_journal_impact, TTL=60s) — max_year  #
#  всего 3 значения (2022-2024), в отличие от /stats/pivot ниже.       #
# ------------------------------------------------------------------ #


@router.get("/stats/journal-impact", response_model=list[JournalImpactPoint], tags=["Analytics"])
async def get_journal_impact(
    max_year: int = Query(2024, ge=2022, le=2024, description="Учитывать статьи, опубликованные <= max_year"),
    service: CatalogService = Depends(get_catalog_service),
) -> list[JournalImpactPoint]:
    return await service.get_journal_impact(max_year=max_year)


# ------------------------------------------------------------------ #
#  GET /stats/pivot — публичный, без JWT                              #
#  Table Builder (docs/explore-table-builder/spec.md §3). Не кэшируется —#
#  ленивая загрузка по выбору пользователя в конкретную комбинацию.   #
# ------------------------------------------------------------------ #


@router.get("/stats/pivot", response_model=PivotResponse, tags=["Analytics"])
async def get_pivot(
    row_dim: PivotDimension = Query(..., description="Измерение по строкам"),
    col_dim: PivotDimension = Query(..., description="Измерение по столбцам"),
    top_n_rows: int = Query(20, ge=1, le=50, description="Топ-N строк по маржинальному объёму"),
    top_n_cols: int = Query(15, ge=1, le=50, description="Топ-N столбцов по маржинальному объёму"),
    filter_dim: PivotDimension | None = Query(None, description="3-е измерение как slicer (фильтр, не ось)"),
    filter_value: str | None = Query(None, description="Значение slicer'а — обязательно, если задан filter_dim"),
    metric: PivotMetric = Query("count", description="Метрика ячейки: count или avg_citations"),
    service: CatalogService = Depends(get_catalog_service),
) -> PivotResponse:
    validation_error = validate_pivot_pair(row_dim, col_dim, filter_dim, filter_value)
    if validation_error is not None:
        raise HTTPException(status_code=422, detail=validation_error)

    return await service.get_pivot(
        row_dim=row_dim,
        col_dim=col_dim,
        top_n_rows=top_n_rows,
        top_n_cols=top_n_cols,
        filter_dim=filter_dim,
        filter_value=filter_value,
        metric=metric,
    )


# ------------------------------------------------------------------ #
#  POST /stats/pivot/nl-query — приватный, JWT обязателен              #
#  AI NL→pivot (docs/ai-nl-pivot/spec.md §3). Текст → LLM → валидные   #
#  параметры pivot; сам pivot не выполняется здесь — фронт вызывает    #
#  GET /stats/pivot отдельно после addBuilderCard().                   #
# ------------------------------------------------------------------ #


@router.post("/stats/pivot/nl-query", response_model=NlPivotQueryResponse, tags=["Analytics"])
async def post_nl_pivot_query(
    request: NlPivotQueryRequest,
    current_user: User = Depends(get_current_user),
    service: NlPivotQueryService = Depends(get_nl_pivot_query_service),
) -> NlPivotQueryResponse:
    # JWT обязателен — нужен user_id для per-user счётчика rate-limit (прецедент —
    # find_articles/get_find_quota выше). enforce_nl_pivot_rate_limit сама бросает
    # 429/503 при необходимости (app/core/nl_pivot_rate_limit.py).
    await enforce_nl_pivot_rate_limit(current_user.id)

    try:
        return await service.resolve(request.query)
    except (NlPivotParseError, NlPivotValidationError) as exc:
        # Текст исключения (может содержать сырой ответ LLM) — только в лог, не клиенту:
        # prompt injection не должен контролировать текст, видимый в UI (§2 спеки).
        # warning, не info — stdlib-логгеры без structlog-обвязки (см. logging_config.py)
        # используют Python lastResort-хендлер (порог WARNING), INFO молча терялся бы
        # (не долетал до Railway логов — найдено при разборе прод-инцидента 2026-07-12).
        logger.warning("NL-pivot: запрос не удалось разрешить: %s", exc)
        raise HTTPException(
            status_code=400,
            detail="Не удалось понять запрос — попробуйте переформулировать",
        ) from exc


# ------------------------------------------------------------------ #
#  GET / — публичный, без JWT                                         #
# ------------------------------------------------------------------ #


@router.get("/", response_model=PaginatedArticleResponse)
async def get_articles(
    page: int = Query(1, ge=1, description="Номер страницы"),
    size: int = Query(10, ge=1, le=100, description="Количество статей на странице"),
    keyword: str | None = Query(
        None,
        min_length=2,
        description="Фильтр по ключевому слову сидера (точное совпадение)",
    ),
    search: str | None = Query(
        None,
        min_length=2,
        description="Fulltext-поиск по названию и первому автору (ILIKE, без учета регистра)",
    ),
    year_from: int | None = Query(
        None,
        ge=1900,
        le=2100,
        description="Фильтр: год публикации от (включительно)",
    ),
    year_to: int | None = Query(
        None,
        ge=1900,
        le=2100,
        description="Фильтр: год публикации до (включительно)",
    ),
    doc_types: list[str] | None = Query(
        None,
        description="Фильтр: типы документов (можно несколько: ?doc_types=Article&doc_types=Review)",
    ),
    open_access: bool | None = Query(
        None,
        description="Фильтр: True — только open-access; False — только закрытые; без параметра — все",
    ),
    countries: list[str] | None = Query(
        None,
        description="Фильтр: страны аффилиации (можно несколько: ?countries=Germany&countries=France)",
    ),
    service: CatalogService = Depends(get_catalog_service),
) -> PaginatedArticleResponse:
    return await service.get_catalog_paginated(
        page=page,
        size=size,
        keyword=keyword,
        search=search,
        year_from=year_from,
        year_to=year_to,
        doc_types=doc_types,
        open_access=open_access,
        countries=countries,
    )


# ------------------------------------------------------------------ #
#  GET /search/stats — приватный, JWT обязателен                      #
# ------------------------------------------------------------------ #


@router.get("/search/stats", response_model=SearchStatsResponse, tags=["Analytics"])
async def get_search_stats(
    search: str = Query(
        ...,
        min_length=2,
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
    return _to_search_stats_response(data)


# ------------------------------------------------------------------ #
#  GET /stats/personal — приватный, JWT обязателен                    #
# ------------------------------------------------------------------ #


@router.get("/stats/personal", response_model=SearchStatsResponse, tags=["Analytics"])
async def get_personal_stats(
    result_repo: PostgresSearchResultRepository = Depends(_get_search_result_repo),
    current_user: User = Depends(get_current_user),
) -> SearchStatsResponse:
    # Приватный эндпоинт — источник инфографики /explore?mode=personal (не кэшируется:
    # низкий QPS, join на ≤HISTORY_DEPTH_LIMIT записей истории на пользователя, по
    # аналогии с /stats/pivot — docs/personal-search-data/spec.md §2.2).
    # search=None — агрегат по ВСЕЙ (не по одному ключевому слову) истории пользователя.
    # Отдельный роут, а не search=None через /search/stats: тот путь никогда не
    # выполнялся и не тестировался (роутер требовал min_length=2).
    data = await result_repo.get_search_stats_for_user(
        user_id=int(current_user.id),
        search=None,
    )
    return _to_search_stats_response(data)


# ------------------------------------------------------------------ #
#  GET /stats/personal/activity — приватный, JWT обязателен           #
# ------------------------------------------------------------------ #


@router.get("/stats/personal/activity", response_model=PersonalActivityResponse, tags=["Analytics"])
async def get_personal_activity(
    result_repo: PostgresSearchResultRepository = Depends(_get_search_result_repo),
    current_user: User = Depends(get_current_user),
) -> PersonalActivityResponse:
    # Автобиографический раздел /explore?mode=personal (docs/explore-personal-redesign/
    # spec.md §2.1) — поисковая активность по времени + накопление уникальных статей.
    # Без кэша — та же логика, что /stats/personal.
    data = await result_repo.get_personal_activity_for_user(user_id=int(current_user.id))
    return PersonalActivityResponse(**data)


def _to_search_stats_response(data: dict) -> SearchStatsResponse:
    # Общий маппинг dict репозитория → Pydantic-схему для /search/stats и /stats/personal
    return SearchStatsResponse(
        total=data["total"],
        by_year=[CountByField(label=str(r["year"]), count=r["count"]) for r in data["by_year"]],
        by_journal=[CountByField(label=r["journal"], count=r["count"]) for r in data["by_journal"]],
        by_country=[CountByField(label=r["country"], count=r["count"]) for r in data["by_country"]],
        by_doc_type=[CountByField(label=r["doc_type"], count=r["count"]) for r in data["by_doc_type"]],
        by_open_access=[
            CountByField(label="true" if r["open_access"] else "false", count=r["count"])
            for r in data["by_open_access"]
        ],
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
    countries: list[str] | None = Query(None, description="Фильтр: страны"),
    service: SearchService = Depends(get_search_service),
    history_service: SearchHistoryService = Depends(get_search_history_service),
    current_user: User = Depends(get_current_user),
    lock_factory: Callable[[int], Any] = Depends(get_advisory_lock_factory),
) -> Any:
    # Собираем payload фильтров только из непустых значений.
    # Ключ «document_types» — единый канонический ключ по всему стеку:
    # роутер → filters_payload → SearchService → build_query → CQL-строка Scopus.
    filters_payload: dict = {}
    if year_from is not None:
        filters_payload["year_from"] = year_from
    if year_to is not None:
        filters_payload["year_to"] = year_to
    if doc_types is not None:
        # Query-параметр называется doc_types (короткий, удобный для HTTP),
        # но внутри сервисного слоя — document_types (полный, читаемый ключ)
        filters_payload["document_types"] = doc_types
    if open_access is not None:
        filters_payload["open_access"] = open_access
    if countries is not None:
        filters_payload["countries"] = countries

    uid = int(current_user.id)

    # Критическая секция: для одного uid одновременно выполняется не более одного блока.
    # Второй запрос будет ждать на pg_advisory_lock до освобождения первым.
    # lock_factory инжектируется через DI — в продакшне pg_advisory_lock, в тестах no-op.
    async with lock_factory(uid):
        # Квотная проверка внутри lock-а: теперь никакой другой запрос
        # этого пользователя не может пройти между проверкой и find_and_save
        quota = await history_service.get_quota(current_user.id)
        if quota.remaining <= 0:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Недельный лимит поиска исчерпан",
            )

        articles = await service.find_and_save(
            keyword,
            count=count,
            user_id=uid,
            filters=filters_payload or None,
        )

    # Заголовки Scopus rate-limit прокидываем вне lock-а —
    # это чтение атрибутов объекта, не критическая секция
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
    n: int = Query(
        SearchHistoryService.HISTORY_DEPTH_LIMIT,
        ge=1,
        le=SearchHistoryService.HISTORY_DEPTH_LIMIT,
        description="Количество последних записей истории",
    ),
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
