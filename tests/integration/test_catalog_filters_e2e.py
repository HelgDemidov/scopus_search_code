# tests/integration/test_catalog_filters_e2e.py
"""
T-5: E2E-тесты серверной фильтрации GET /articles/.

Проверяют, что PostgresCatalogRepository._apply_filters() корректно
транслирует Query-параметры FastAPI в WHERE-клаузы SQL через полный
HTTP-стек: HTTP GET → роутер → CatalogService → PostgresCatalogRepository → PostgreSQL.

Каждый тест: seed данных через pg_session → запрос через pg_client → assert.
Авторизация не нужна — GET /articles/ публичный эндпоинт.
"""
import datetime

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.article import Article
from app.models.catalog_article import CatalogArticle


# ------------------------------------------------------------------ #
#  Хелпер: сконструировать Article без сессии                         #
# ------------------------------------------------------------------ #

def _make_article(
    *,
    title: str,
    year: int,
    document_type: str | None = None,
    open_access: bool | None = None,
    affiliation_country: str | None = None,
    doi: str | None = None,
) -> Article:
    # Конструируем ORM-объект Article без сессии — добавим через add() позже
    return Article(
        title=title,
        author="Test Author",
        publication_date=datetime.date(year, 6, 1),
        doi=doi,
        document_type=document_type,
        open_access=open_access,
        affiliation_country=affiliation_country,
    )


async def _seed(session: AsyncSession, articles: list[Article], keyword: str = "test") -> None:
    # Сохраняем статьи и создаём записи catalog_articles в одной транзакции
    session.add_all(articles)
    await session.flush()  # получаем id до создания CatalogArticle

    catalog_rows = [
        CatalogArticle(article_id=a.id, keyword=keyword)
        for a in articles
    ]
    session.add_all(catalog_rows)
    await session.commit()


# ------------------------------------------------------------------ #
#  T5-1: year_from                                                     #
# ------------------------------------------------------------------ #

@pytest.mark.asyncio
async def test_year_from_filters_by_publication_year(
    pg_session: AsyncSession,
    pg_client: AsyncClient,
) -> None:
    # Arrange: статья 2020 года и статья 2024 года
    old = _make_article(title="Old Paper", year=2020, doi="10.1/old")
    new = _make_article(title="New Paper", year=2024, doi="10.1/new")
    await _seed(pg_session, [old, new])

    # Act: запрашиваем только статьи начиная с 2022 года
    resp = await pg_client.get("/articles/", params={"year_from": 2022})

    # Assert: только New Paper 2024 удовлетворяет фильтру
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 1
    assert data["items"][0]["title"] == "New Paper"


# ------------------------------------------------------------------ #
#  T5-2: year_to                                                       #
# ------------------------------------------------------------------ #

@pytest.mark.asyncio
async def test_year_to_filters_by_publication_year(
    pg_session: AsyncSession,
    pg_client: AsyncClient,
) -> None:
    # Arrange: статья 2020 года и статья 2024 года
    old = _make_article(title="Old Paper", year=2020, doi="10.2/old")
    new = _make_article(title="New Paper", year=2024, doi="10.2/new")
    await _seed(pg_session, [old, new])

    # Act: запрашиваем только статьи до 2021 года включительно
    resp = await pg_client.get("/articles/", params={"year_to": 2021})

    # Assert: только Old Paper 2020 удовлетворяет фильтру
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 1
    assert data["items"][0]["title"] == "Old Paper"


# ------------------------------------------------------------------ #
#  T5-3: doc_types                                                     #
# ------------------------------------------------------------------ #

@pytest.mark.asyncio
async def test_doc_types_filters_by_document_type(
    pg_session: AsyncSession,
    pg_client: AsyncClient,
) -> None:
    # Arrange: статья типа "Article" и статья типа "Review"
    article = _make_article(title="Article Paper", year=2023, document_type="Article", doi="10.3/ar")
    review = _make_article(title="Review Paper", year=2023, document_type="Review", doi="10.3/rv")
    await _seed(pg_session, [article, review])

    # Act: фильтруем по doc_types=Article
    resp = await pg_client.get("/articles/", params={"doc_types": "Article"})

    # Assert: только Article Paper попадает в результат
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 1
    assert data["items"][0]["title"] == "Article Paper"


# ------------------------------------------------------------------ #
#  T5-4: open_access=true                                              #
# ------------------------------------------------------------------ #

@pytest.mark.asyncio
async def test_open_access_true_filters_correctly(
    pg_session: AsyncSession,
    pg_client: AsyncClient,
) -> None:
    # Arrange: одна OA-статья, одна закрытая
    oa = _make_article(title="OA Paper", year=2023, open_access=True, doi="10.4/oa")
    closed = _make_article(title="Closed Paper", year=2023, open_access=False, doi="10.4/cl")
    await _seed(pg_session, [oa, closed])

    # Act: фильтруем только open access
    resp = await pg_client.get("/articles/", params={"open_access": "true"})

    # Assert: только OA Paper возвращается
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 1
    assert data["items"][0]["title"] == "OA Paper"


# ------------------------------------------------------------------ #
#  T5-5: countries                                                     #
# ------------------------------------------------------------------ #

@pytest.mark.asyncio
async def test_countries_filters_by_affiliation_country(
    pg_session: AsyncSession,
    pg_client: AsyncClient,
) -> None:
    # Arrange: статья из Германии и статья из Франции
    de = _make_article(title="German Paper", year=2023, affiliation_country="Germany", doi="10.5/de")
    fr = _make_article(title="French Paper", year=2023, affiliation_country="France", doi="10.5/fr")
    await _seed(pg_session, [de, fr])

    # Act: фильтруем по странам=Germany
    resp = await pg_client.get("/articles/", params={"countries": "Germany"})

    # Assert: только German Paper возвращается
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 1
    assert data["items"][0]["title"] == "German Paper"


# ------------------------------------------------------------------ #
#  T5-6: комбинация year_from + open_access                           #
# ------------------------------------------------------------------ #

@pytest.mark.asyncio
async def test_combined_filters_narrow_results(
    pg_session: AsyncSession,
    pg_client: AsyncClient,
) -> None:
    # Arrange: 3 статьи — только одна проходит оба фильтра
    # - old_oa  (2021, OA):     не проходит year_from=2022
    # - new_closed (2023, !OA): не проходит open_access=true
    # - new_oa  (2023, OA):     проходит оба условия
    old_oa = _make_article(title="Old OA", year=2021, open_access=True, doi="10.6/oldoa")
    new_closed = _make_article(title="New Closed", year=2023, open_access=False, doi="10.6/newcl")
    new_oa = _make_article(title="New OA", year=2023, open_access=True, doi="10.6/newoa")
    await _seed(pg_session, [old_oa, new_closed, new_oa])

    # Act: year_from=2022 AND open_access=true
    resp = await pg_client.get(
        "/articles/",
        params={"year_from": 2022, "open_access": "true"},
    )

    # Assert: только New OA удовлетворяет обоим условиям
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 1
    assert data["items"][0]["title"] == "New OA"
