# app/routers/seeder_router.py
import os

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.dependencies import get_db_session, get_email_service
from app.infrastructure.postgres_article_repo import PostgresArticleRepository
from app.infrastructure.postgres_catalog_repo import PostgresCatalogRepository
from app.infrastructure.redis_client import redis_client
from app.infrastructure.scopus_client import ScopusHTTPClient
from app.interfaces.email_service import IEmailService
from app.services.catalog_service import CatalogService

router = APIRouter(prefix="/seeder", tags=["seeder"])

# Секрет из env — fail-fast при запуске если не задан
_SEEDER_SECRET: str = os.environ.get("SEEDER_SECRET", "")


def _check_secret(x_seeder_secret: str = Header(...)) -> None:
    # Проверяем заголовок X-Seeder-Secret — не user JWT, не зависит от сессии
    if not _SEEDER_SECRET or x_seeder_secret != _SEEDER_SECRET:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")


@router.post("/seed", dependencies=[Depends(_check_secret)])
async def seed_keyword(
    keyword: str,
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


@router.post("/health-check", dependencies=[Depends(_check_secret)])
async def health_check_and_alert(
    session: AsyncSession = Depends(get_db_session),
    email_svc: IEmailService = Depends(get_email_service),
) -> dict[str, str]:
    """Piggyback health-check на seeder cron (issue #48) — БД/Redis деградировали → письмо.

    Реалтайм-алертинга не даёт: латентность до 2ч, привязана к циклу cron —
    осознанный trade-off вместо Sentry/OTel (см. docs/project_context/
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
        await email_svc.send_alert_email(
            to_email=settings.FROM_EMAIL,
            subject="Scopus Search — health check failed",
            message=f"Проблемы с: {', '.join(problems)}",
        )
    return {"status": "degraded", "problems": ",".join(problems)}
