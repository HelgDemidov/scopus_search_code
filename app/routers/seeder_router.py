# app/routers/seeder_router.py
import os
from fastapi import APIRouter, Depends, Header, HTTPException, status
import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_db_session
from app.infrastructure.postgres_article_repo import PostgresArticleRepository
from app.infrastructure.postgres_catalog_repo import PostgresCatalogRepository
from app.infrastructure.scopus_client import ScopusHTTPClient
from app.services.catalog_service import CatalogService

router = APIRouter(prefix="/seeder", tags=["seeder"])

# Секрет из env — fail-fast при запуске если не задан
_SEEDER_SECRET: str = os.environ.get("SEEDER_SECRET", "")


def _check_secret(x_seeder_secret: str = Header(...)):
    # Проверяем заголовок X-Seeder-Secret — не user JWT, не зависит от сессии
    if not _SEEDER_SECRET or x_seeder_secret != _SEEDER_SECRET:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")


@router.post("/seed", dependencies=[Depends(_check_secret)])
async def seed_keyword(
    keyword: str,
    count: int = 25,
    session: AsyncSession = Depends(get_db_session),
):
    # Вызываем Scopus, сохраняем в catalog_articles через CatalogService.seed()
    async with httpx.AsyncClient(timeout=30.0) as http_client:
        scopus = ScopusHTTPClient(http_client)
        articles = await scopus.search(keyword=keyword, count=count)

    articles_found = len(articles)
    if not articles:
        return {"keyword": keyword, "saved": 0, "rate_remaining": None}

    service = CatalogService(
        catalog_repo=PostgresCatalogRepository(session),
        article_repo=PostgresArticleRepository(session),
        session=session,
    )
    saved = await service.seed(keyword=keyword, articles=articles)

    # Пробрасываем rate_remaining обратно сидеру для проверки лимита Scopus
    return {
        "keyword": keyword,
        "saved": len(saved),
        "rate_remaining": scopus.last_rate_remaining,
    }