# app/routers/seeder_router.py
import logging
import os

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, Query, status
from sqlalchemy import func, text, update
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from app.config import settings
from app.core.dependencies import get_catalog_service, get_db_session, get_email_service
from app.infrastructure.postgres_article_repo import PostgresArticleRepository
from app.infrastructure.postgres_catalog_repo import PostgresCatalogRepository
from app.infrastructure.redis_client import redis_client
from app.infrastructure.scopus_client import ScopusHTTPClient
from app.interfaces.email_service import IEmailService
from app.models.seeder_run_state import SeederRunState
from app.services.catalog_service import CatalogService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/seeder", tags=["seeder"])

# Секрет из env — fail-fast при запуске если не задан
_SEEDER_SECRET: str = os.environ.get("SEEDER_SECRET", "")

# Раз в сколько прогонов сидера делать VACUUM ANALYZE articles (POST /seeder/vacuum).
# GIN pending list (pg_trgm title/author) деградирует чтение каталога ~×2 уже за
# ~2 суток при историческом темпе прироста сидера (~3567 строк/день) без VACUUM —
# измерено эмпирически (см. docs/backend-performance/catalog-search-latency/spec.md).
# Штатный autovacuum_vacuum_insert_threshold сработал бы сам не раньше ~13 дней при
# этом темпе — недостаточно быстро. 10 прогонов по 2ч = ~20ч — с запасом чаще порога.
VACUUM_EVERY_N_RUNS = 10


def _is_vacuum_due(run_count: int) -> bool:
    return run_count % VACUUM_EVERY_N_RUNS == 0


def _check_secret(x_seeder_secret: str = Header(...)) -> None:
    # Проверяем заголовок X-Seeder-Secret — не user JWT, не зависит от сессии
    if not _SEEDER_SECRET or x_seeder_secret != _SEEDER_SECRET:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")


@router.post("/seed", dependencies=[Depends(_check_secret)])
async def seed_keyword(
    # Зеркалит catalog_articles.keyword: VARCHAR(100) — defense-in-depth на границе API,
    # независимо от того, кто вызывает эндпоинт (см. docs/seeder/seeder-hardening/spec.md §2).
    keyword: str = Query(..., max_length=100),
    count: int = 25,
    start: int = 0,
    session: AsyncSession = Depends(get_db_session),
) -> dict[str, object]:
    # Вызываем Scopus, сохраняем в catalog_articles через CatalogService.seed()
    async with httpx.AsyncClient(timeout=30.0) as http_client:
        scopus = ScopusHTTPClient(http_client)
        articles = await scopus.search(keyword=keyword, count=count, start=start)

    if not articles:
        return {"keyword": keyword, "saved": 0, "start": start, "rate_remaining": None}

    service = CatalogService(
        catalog_repo=PostgresCatalogRepository(session),
        article_repo=PostgresArticleRepository(session),
        session=session,
    )
    saved = await service.seed(keyword=keyword, articles=articles)

    # Пробрасываем rate_remaining и start обратно сидеру для логирования и rate-guard
    return {
        "keyword": keyword,
        "saved": len(saved),
        "start": start,
        "rate_remaining": scopus.last_rate_remaining,
    }


@router.post("/gc", dependencies=[Depends(_check_secret)])
async def garbage_collect_articles(
    session: AsyncSession = Depends(get_db_session),
) -> dict[str, int]:
    """Удаляет статьи-сироты (см. IArticleRepository.delete_orphaned).

    Однотабличная операция, атомарность одного DELETE — коммит здесь же,
    без выделения под неё отдельного сервиса (ArticleService — thin-сервис
    только для GET /articles/{id}, см. его docstring).
    """
    repo = PostgresArticleRepository(session)
    deleted = await repo.delete_orphaned()
    await session.commit()
    return {"deleted": deleted}


@router.post("/refresh-stats-cache", dependencies=[Depends(_check_secret)])
async def refresh_stats_cache(
    service: CatalogService = Depends(get_catalog_service),
) -> dict[str, int]:
    """Piggyback на конце сидер-рана (docs/backend-performance/explore-cold-start-mitigation/spec.md
    §3.1) — форсированно обновляет Redis-кэш /explore-агрегатов (get_stats/get_kpi_totals/
    get_journal_impact) сразу после того, как сидер изменил каталог, вместо ожидания
    истечения EXPLORE_STATS_CACHE_TTL реактивным первым посетителем /explore.
    """
    refreshed = await service.refresh_explore_stats_cache()
    return {"refreshed_keys": refreshed}


async def _run_vacuum_analyze(engine: AsyncEngine) -> None:
    """VACUUM не может идти внутри транзакции (Postgres это прямо запрещает) —
    отдельное AUTOCOMMIT-соединение. Вынесено отдельной функцией ради
    тестируемости — _vacuum_articles_task ниже подменяется в тестах точечно,
    без мока всего AsyncEngine."""
    async with engine.execution_options(isolation_level="AUTOCOMMIT").connect() as vacuum_conn:
        await vacuum_conn.execute(text("VACUUM ANALYZE articles"))


async def _vacuum_articles_task(engine: AsyncEngine, run_count: int) -> None:
    """Фоновая задача (BackgroundTasks) — выполняется ПОСЛЕ отправки HTTP-ответа,
    поэтому клиент (seed_db.py) никогда не ждёт дольше времени апдейта счётчика,
    сколько бы реально ни шёл VACUUM ANALYZE (замерено — многие минуты на
    прод-таблице, см. docs/seeder/seeder-vacuum-resilience/spec.md §0).

    Собственный, независимый от request-сессии engine — та уже закрыта к
    моменту, когда фоновая задача реально стартует (dependency get_db_session
    завершает `async with async_session_maker()` сразу после отправки ответа).

    Сбою здесь некуда всплыть — HTTP-ответ уже ушёл. Логируем + алертим тем же
    каналом, что и /seeder/health-check, вместо тихого проглатывания.
    """
    try:
        await _run_vacuum_analyze(engine)
    except SQLAlchemyError:
        logger.error("VACUUM ANALYZE articles failed (run_count=%s)", run_count, exc_info=True)
        if settings.FROM_EMAIL:
            try:
                await get_email_service().send_alert_email(
                    to_email=settings.FROM_EMAIL,
                    subject="Scopus Search — vacuum failed",
                    message=f"VACUUM ANALYZE articles упал на прогоне #{run_count}",
                )
            except httpx.HTTPError:
                logger.error("Vacuum-failure alert email failed", exc_info=True)
        return

    async with engine.connect() as conn:
        await conn.execute(update(SeederRunState).where(SeederRunState.id == 1).values(last_vacuum_at=func.now()))
        await conn.commit()


@router.post("/vacuum", dependencies=[Depends(_check_secret)])
async def maybe_vacuum_articles(
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_db_session),
) -> dict[str, object]:
    """Раз в VACUUM_EVERY_N_RUNS прогонов сидера — планирует VACUUM ANALYZE articles.

    Счётчик seeder_run_state(id=1) — обычный ORM-апдейт в транзакции запроса,
    работает на любом диалекте, отвечает синхронно и быстро всегда. Сам VACUUM
    (если пора) уходит в BackgroundTasks — см. _vacuum_articles_task выше.
    Поле ответа "vacuum_scheduled" — честно: синхронно неизвестно, выполнился
    ли VACUUM, только что он поставлен в очередь (тот же принцип честности,
    что total_is_capped в PaginatedArticleResponse).

    Строку id=1 создаёт миграция 0019 — но тестовые фикстуры (SQLite и
    requires_pg pg_engine) строят схему через Base.metadata.create_all, не
    через реальные Alembic-миграции, поэтому строки может не быть. Read-repair
    (INSERT при отсутствии) не полагается на то, как именно создана схема.
    """
    result = await session.execute(
        update(SeederRunState)
        .where(SeederRunState.id == 1)
        .values(run_count=SeederRunState.run_count + 1)
        .returning(SeederRunState.run_count)
    )
    run_count = result.scalar_one_or_none()
    if run_count is None:
        session.add(SeederRunState(id=1, run_count=1))
        await session.flush()
        run_count = 1
    await session.commit()

    if not _is_vacuum_due(run_count):
        return {"run_count": run_count, "vacuum_scheduled": False, "every_n_runs": VACUUM_EVERY_N_RUNS}

    conn = await session.connection()
    if conn.dialect.name != "postgresql":
        # SQLite (тесты) не поддерживает VACUUM ANALYZE <table> — тот же
        # dialect-check, что get_stats()/get_journal_impact() (postgres_catalog_repo.py)
        return {"run_count": run_count, "vacuum_scheduled": False, "every_n_runs": VACUUM_EVERY_N_RUNS}

    background_tasks.add_task(_vacuum_articles_task, conn.engine, run_count)
    return {"run_count": run_count, "vacuum_scheduled": True, "every_n_runs": VACUUM_EVERY_N_RUNS}


@router.post("/health-check", dependencies=[Depends(_check_secret)])
async def health_check_and_alert(
    session: AsyncSession = Depends(get_db_session),
    email_svc: IEmailService = Depends(get_email_service),
) -> dict[str, str]:
    """Piggyback health-check на seeder cron (issue #48) — БД/Redis деградировали → письмо.

    Реалтайм-алертинга не даёт: латентность до 2ч, привязана к циклу cron —
    осознанный trade-off вместо Sentry/OTel (см. docs/project-meta/project_context/
    scopus-search-feedback-2026-07-03.md).
    """
    problems: list[str] = []

    try:
        await session.execute(text("SELECT 1"))
    except SQLAlchemyError:
        problems.append("database")

    if redis_client is not None and not await redis_client.ping():
        problems.append("redis")

    if not problems:
        return {"status": "ok"}

    if settings.FROM_EMAIL:
        try:
            await email_svc.send_alert_email(
                to_email=settings.FROM_EMAIL,
                subject="Scopus Search — health check failed",
                message=f"Проблемы с: {', '.join(problems)}",
            )
        except httpx.HTTPError:
            # Канал уведомления (Brevo) — best-effort: его сбой не должен прятать уже
            # обнаруженную деградацию за 500 вместо честного {"status": "degraded"}.
            logger.error("Health-check alert email failed", exc_info=True)
    return {"status": "degraded", "problems": ",".join(problems)}
