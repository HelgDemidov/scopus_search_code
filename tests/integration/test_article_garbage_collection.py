"""Интеграционные тесты для IArticleRepository.delete_orphaned (GC статей-сирот).

До PR #45 (retention-trim search_history) сирот в articles не возникало —
search_history/search_result_articles никогда не удалялись. CASCADE-удаление
старых search_result_articles при trim теперь может оставить статью без единой
ссылки. Не requires_pg: коррелированный NOT EXISTS без PG-специфики (тот же
принцип портируемости, что ISearchHistoryRepository.trim_to_last_n).
"""

import datetime

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.postgres_article_repo import PostgresArticleRepository
from app.models.article import Article
from app.models.catalog_article import CatalogArticle
from app.models.search_history import SearchHistory
from app.models.search_result_article import SearchResultArticle


def _mk_article(n: int) -> Article:
    return Article(
        title=f"Article {n}",
        author="Author",
        publication_date=datetime.date(2024, 1, 1),
        doi=f"10.test/gc/{n}",
    )


async def _remaining_dois(db_session: AsyncSession) -> set[str]:
    rows = (await db_session.execute(select(Article))).scalars().all()
    return {a.doi for a in rows}


@pytest.mark.asyncio
async def test_delete_orphaned_removes_article_with_no_references(db_session: AsyncSession):
    article = _mk_article(1)
    db_session.add(article)
    await db_session.commit()

    repo = PostgresArticleRepository(db_session)
    deleted = await repo.delete_orphaned()
    await db_session.commit()

    assert deleted == 1
    assert await _remaining_dois(db_session) == set()


@pytest.mark.asyncio
async def test_delete_orphaned_keeps_catalog_article(db_session: AsyncSession):
    article = _mk_article(2)
    db_session.add(article)
    await db_session.flush()
    db_session.add(CatalogArticle(article_id=article.id, keyword="deep learning"))
    await db_session.commit()

    repo = PostgresArticleRepository(db_session)
    deleted = await repo.delete_orphaned()
    await db_session.commit()

    assert deleted == 0
    assert await _remaining_dois(db_session) == {article.doi}


@pytest.mark.asyncio
async def test_delete_orphaned_keeps_article_referenced_by_active_search(db_session: AsyncSession):
    article = _mk_article(3)
    db_session.add(article)
    await db_session.flush()

    history = SearchHistory(user_id=1, query="q", result_count=1, filters={})
    db_session.add(history)
    await db_session.flush()

    db_session.add(SearchResultArticle(search_history_id=history.id, article_id=article.id, rank=0))
    await db_session.commit()

    repo = PostgresArticleRepository(db_session)
    deleted = await repo.delete_orphaned()
    await db_session.commit()

    assert deleted == 0
    assert await _remaining_dois(db_session) == {article.doi}


@pytest.mark.asyncio
async def test_delete_orphaned_mixed_batch_removes_only_true_orphan(db_session: AsyncSession):
    orphan = _mk_article(4)
    catalog_article = _mk_article(5)
    searched_article = _mk_article(6)
    db_session.add_all([orphan, catalog_article, searched_article])
    await db_session.flush()

    db_session.add(CatalogArticle(article_id=catalog_article.id, keyword="transformer"))

    history = SearchHistory(user_id=1, query="q", result_count=1, filters={})
    db_session.add(history)
    await db_session.flush()
    db_session.add(SearchResultArticle(search_history_id=history.id, article_id=searched_article.id, rank=0))
    await db_session.commit()

    repo = PostgresArticleRepository(db_session)
    deleted = await repo.delete_orphaned()
    await db_session.commit()

    assert deleted == 1
    assert await _remaining_dois(db_session) == {catalog_article.doi, searched_article.doi}


@pytest.mark.asyncio
async def test_delete_orphaned_empty_db_is_noop(db_session: AsyncSession):
    repo = PostgresArticleRepository(db_session)
    deleted = await repo.delete_orphaned()
    await db_session.commit()

    assert deleted == 0


@pytest.mark.asyncio
async def test_delete_orphaned_idempotent_second_call_returns_zero(db_session: AsyncSession):
    article = _mk_article(7)
    db_session.add(article)
    await db_session.commit()

    repo = PostgresArticleRepository(db_session)
    assert await repo.delete_orphaned() == 1
    await db_session.commit()

    assert await repo.delete_orphaned() == 0
    await db_session.commit()
