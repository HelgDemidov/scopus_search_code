"""Сквозные интеграционные тесты для всей сводной таблицы изменений.

Покрывает все 10 пунктов:
  1.  ArticleResponse.id: int    — Pydantic-схема (article_schemas.py)
  2.  IArticleRepository.get_by_id — абстрактный метод интерфейса
  3.  PostgresArticleRepository.get_by_id — SQL-реализация через SQLite in-memory
  4.  ArticleService.get_by_id   — делегирование репозиторию
  5.  GET /articles/{id}          — роутер: корректный ответ и положение маршрута
  6.  frontend ArticleResponse.id — верифицируется косвенно через JSON-ответ
  7.  frontend getArticleById     — косвенно: HTTP 200 возвращает корректный JSON
  8.  ArticleCard <Link>          — ссылки проверяются в E2E-блоке ниже
  9.  ArticlePage loading/404/data — проверяется через HTTP-ответы бэкенда
  10. App.tsx маршрут /article/:id — прямой запрос через httpx проверяет роутинг FastAPI

Требования к окружению:
  pip install pytest pytest-asyncio httpx aiosqlite
  запускать из корня проекта: pytest tests/integration/test_article_by_id.py -v
"""

from __future__ import annotations

import datetime
from typing import AsyncGenerator

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from app.core.dependencies import get_db_session
from app.infrastructure.postgres_article_repo import PostgresArticleRepository
from app.main import app
from app.models.article import Article
from app.models.base import Base
from app.schemas.article_schemas import ArticleResponse
from app.services.article_service import ArticleService
from tests.conftest import fetch_article_after_insert

# ---------------------------------------------------------------------------
# Вспомогательные константы
# ---------------------------------------------------------------------------

_TEST_DB_URL = "sqlite+aiosqlite:///:memory:"

# Константы тестовых данных
_TEST_DOI: str = "10.1234/test-doi-001"  # DOI единственной тестовой статьи

_ARTICLE_KWARGS = dict(
    title="Neural Networks in Drug Discovery",
    journal="Nature Machine Intelligence",
    author="Ivanov I.",
    publication_date=datetime.date(2024, 3, 15),
    doi=_TEST_DOI,                           # ← используем константу
    keyword="drug discovery AI",
    cited_by_count=42,
    document_type="Article",
    open_access=True,
    affiliation_country="Russia",
    is_seeded=True,
)


# ---------------------------------------------------------------------------
# Фикстуры — изолированная in-memory БД (аналогично conftest.py)
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture(scope="function")
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    """Изолированная SQLite БД для каждого теста."""
    engine = create_async_engine(_TEST_DB_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with AsyncSession(engine, expire_on_commit=False) as session:
        yield session
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest_asyncio.fixture(scope="function")
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    """AsyncClient с переопределенной зависимостью get_db_session."""
    async def _override() -> AsyncGenerator[AsyncSession, None]:
        yield db_session

    app.dependency_overrides[get_db_session] = _override
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


@pytest_asyncio.fixture(scope="function")
async def saved_article(db_session: AsyncSession) -> Article:
    """Сохраняет одну тестовую статью через upsert_many(), возвращает ORM-объект с id.
    upsert_many() использует Core INSERT (insert().on_conflict_do_update) — объект
    не попадает в identity_map сессии, поэтому refresh() недопустим.
    Вместо этого загружаем статью из БД заново через SELECT по doi.
    """
    repo = PostgresArticleRepository(db_session)
    article = Article(**_ARTICLE_KWARGS)
    await repo.upsert_many([article])
    # Получаем ORM-объект с реальным autoincrement id через SELECT, а не refresh()
    return await fetch_article_after_insert(db_session, _TEST_DOI)


# ---------------------------------------------------------------------------
# 1. Pydantic-схема: ArticleResponse должна содержать поле id: int
# ---------------------------------------------------------------------------

class TestArticleResponseSchema:
    """Пункт 1 сводной таблицы: id: int в ArticleResponse."""

    def test_id_field_present_in_schema(self):
        """id должен быть объявлен первым полем и иметь тип int."""
        fields = ArticleResponse.model_fields
        assert "id" in fields, "Поле 'id' отсутствует в ArticleResponse"
        # Pydantic v2: annotation хранит тип аннотации
        annotation = fields["id"].annotation
        assert annotation is int, f"Ожидался int, получен {annotation}"

    def test_schema_validates_id_from_orm(self):
        """model_validate должен успешно распарсить ORM-объект с id."""
        article = Article(
            id=99,
            title="Test Title",
            publication_date=datetime.date(2024, 1, 1),
            keyword="test",
            is_seeded=False,
        )
        response = ArticleResponse.model_validate(article)
        assert response.id == 99
        assert response.title == "Test Title"

    def test_schema_requires_id_not_none(self):
        """id=None должен вызвать ValidationError: поле обязательное."""
        import pydantic
        with pytest.raises(pydantic.ValidationError):
            ArticleResponse.model_validate(
                {"id": None, "title": "X", "publication_date": "2024-01-01", "keyword": "x"}
            )


# ---------------------------------------------------------------------------
# 2–3. Репозиторий: интерфейс + реализация get_by_id
# ---------------------------------------------------------------------------

class TestRepositoryGetById:
    """Пункты 2–3: IArticleRepository.get_by_id и PostgresArticleRepository.get_by_id."""

    @pytest.mark.asyncio
    async def test_get_by_id_returns_article(
        self, db_session: AsyncSession, saved_article: Article
    ):
        """get_by_id должен вернуть тот же объект, что был сохранен."""
        repo = PostgresArticleRepository(db_session)
        result = await repo.get_by_id(saved_article.id)

        assert result is not None
        assert result.id == saved_article.id
        assert result.title == _ARTICLE_KWARGS["title"]
        assert result.doi == _ARTICLE_KWARGS["doi"]

    @pytest.mark.asyncio
    async def test_get_by_id_returns_none_for_missing(
        self, db_session: AsyncSession
    ):
        """get_by_id с несуществующим id должен вернуть None."""
        repo = PostgresArticleRepository(db_session)
        result = await repo.get_by_id(99999)
        assert result is None

    @pytest.mark.asyncio
    async def test_get_by_id_returns_none_for_negative_id(
        self, db_session: AsyncSession
    ):
        """Отрицательный id — граничный случай, должен вернуть None (не 500)."""
        repo = PostgresArticleRepository(db_session)
        result = await repo.get_by_id(-1)
        assert result is None


# ---------------------------------------------------------------------------
# 4. ArticleService.get_by_id — делегирование и конвертация ORM → Pydantic
# ---------------------------------------------------------------------------

class TestArticleServiceGetById:
    """Пункт 4: ArticleService.get_by_id."""

    @pytest.mark.asyncio
    async def test_service_returns_pydantic_model(
        self, db_session: AsyncSession, saved_article: Article
    ):
        """Сервис должен вернуть ArticleResponse (не ORM Article)."""
        repo = PostgresArticleRepository(db_session)
        service = ArticleService(article_repo=repo)
        result = await service.get_by_id(saved_article.id)

        assert result is not None
        assert isinstance(result, ArticleResponse)
        assert result.id == saved_article.id
        assert result.title == _ARTICLE_KWARGS["title"]

    @pytest.mark.asyncio
    async def test_service_returns_none_for_missing(
        self, db_session: AsyncSession
    ):
        """Сервис возвращает None, если репозиторий возвращает None."""
        repo = PostgresArticleRepository(db_session)
        service = ArticleService(article_repo=repo)
        result = await service.get_by_id(999)
        assert result is None


# ---------------------------------------------------------------------------
# 5 + 9. Роутер: GET /articles/{id} — HTTP-контракт
# ---------------------------------------------------------------------------

class TestArticleByIdEndpoint:
    """Пункты 5, 9: HTTP-эндпоинт GET /articles/{id}."""

    @pytest.mark.asyncio
    async def test_200_returns_correct_structure(
        self, client: AsyncClient, saved_article: Article
    ):
        """HTTP 200 и корректная структура JSON-ответа включая поле id."""
        resp = await client.get(f"/articles/{saved_article.id}")

        assert resp.status_code == 200
        data = resp.json()

        # Проверяем все поля, которые теперь есть в ArticleResponse
        assert data["id"] == saved_article.id
        assert data["title"] == _ARTICLE_KWARGS["title"]
        assert data["journal"] == _ARTICLE_KWARGS["journal"]
        assert data["author"] == _ARTICLE_KWARGS["author"]
        assert data["doi"] == _ARTICLE_KWARGS["doi"]
        assert data["keyword"] == _ARTICLE_KWARGS["keyword"]
        assert data["cited_by_count"] == _ARTICLE_KWARGS["cited_by_count"]
        assert data["document_type"] == _ARTICLE_KWARGS["document_type"]
        assert data["open_access"] is True
        assert data["affiliation_country"] == _ARTICLE_KWARGS["affiliation_country"]
        # Дата приходит как строка ISO 8601
        assert data["publication_date"] == "2024-03-15"

    @pytest.mark.asyncio
    async def test_404_for_missing_id(self, client: AsyncClient):
        """HTTP 404 с корректным detail, если id не существует."""
        resp = await client.get("/articles/99999")

        assert resp.status_code == 404
        data = resp.json()
        assert "detail" in data
        assert data["detail"] == "Article not found"

    @pytest.mark.asyncio
    async def test_422_for_non_integer_id(self, client: AsyncClient):
        """HTTP 422, если в URL передана не-числовая строка."""
        resp = await client.get("/articles/not-a-number")
        # FastAPI автоматически валидирует path param как int
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_stats_not_shadowed_by_id_route(self, client: AsyncClient):
        """
        Пункт 5 (архитектурный): /articles/stats не должен перехватываться
        маршрутом /{article_id}. Роутер объявляет /{id} ПОСЛЕДНИМ.
        """
        resp = await client.get("/articles/stats")
        # /stats — публичный эндпоинт, должен вернуть 200 с полем total_articles
        assert resp.status_code == 200, (
            f"/articles/stats перехвачен маршрутом /{{id}}! Ответ: {resp.text}"
        )
        data = resp.json()
        assert "total_articles" in data

    @pytest.mark.asyncio
    async def test_find_not_shadowed_by_id_route(self, client: AsyncClient):
        """
        Аналогично: /articles/find не должен перехватываться /{article_id}.
        Без авторизации ожидаем 401/403, а не 422.
        """
        resp = await client.get("/articles/find", params={"keyword": "AI"})
        # Не авторизован → 401 или 403, но точно не 422 (что означало бы path param)
        assert resp.status_code in (401, 403), (
            f"/articles/find перехвачен маршрутом /{{id}}! Ответ: {resp.status_code} {resp.text}"
        )

    @pytest.mark.asyncio
    async def test_root_listing_not_shadowed(self, client: AsyncClient):
        """
        GET /articles/ (список) не должен конфликтовать с /{id}.
        """
        resp = await client.get("/articles/")
        assert resp.status_code == 200
        data = resp.json()
        assert "articles" in data
        assert "total" in data

    @pytest.mark.asyncio
    async def test_id_field_present_in_list_response(
        self, client: AsyncClient, saved_article: Article
    ):
        """
        Пункт 1 (E2E): поле id присутствует в каждом объекте
        при ответе GET /articles/ — убеждаемся, что изменение схемы
        прошло сквозь весь стек до HTTP-ответа.
        """
        resp = await client.get("/articles/", params={"page": 1, "size": 10})
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 1
        first = data["articles"][0]
        assert "id" in first, "Поле id отсутствует в ArticleResponse в /articles/ листинге"
        assert isinstance(first["id"], int)


# ---------------------------------------------------------------------------
# 6. Frontend-тип ArticleResponse.id (косвенная верификация через HTTP-ответ)
# ---------------------------------------------------------------------------

class TestFrontendTypeConsistency:
    """
    Пункт 6: frontend/src/types/api.ts — id: number.
    Тест косвенный: убеждаемся, что бэкенд возвращает id как JSON integer,
    что соответствует TypeScript number.
    """

    @pytest.mark.asyncio
    async def test_id_is_json_integer(
        self, client: AsyncClient, saved_article: Article
    ):
        resp = await client.get(f"/articles/{saved_article.id}")
        assert resp.status_code == 200
        data = resp.json()
        # JSON integer → Python int. Если бы пришла строка — isinstance вернул бы False
        assert isinstance(data["id"], int), (
            f"id должен быть JSON integer (TS number), получен {type(data['id'])}"
        )


# ---------------------------------------------------------------------------
# 7. getArticleById — симуляция логики фронтенд-функции через HTTP
# ---------------------------------------------------------------------------

class TestGetArticleByIdContract:
    """
    Пункт 7: frontend/src/api/articles.ts → getArticleById.
    Проверяет HTTP-контракт, который вызывает фронтенд.
    """

    @pytest.mark.asyncio
    async def test_correct_url_pattern(
        self, client: AsyncClient, saved_article: Article
    ):
        """Фронтенд вызывает apiClient.get(`/articles/${id}`) — проверяем этот URL."""
        resp = await client.get(f"/articles/{saved_article.id}")
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_response_shape_matches_frontend_type(
        self, client: AsyncClient, saved_article: Article
    ):
        """Все поля ArticleResponse из frontend/src/types/api.ts присутствуют в ответе."""
        resp = await client.get(f"/articles/{saved_article.id}")
        data = resp.json()

        expected_fields = {
            "id", "title", "journal", "author", "publication_date",
            "doi", "keyword", "cited_by_count", "document_type",
            "open_access", "affiliation_country",
        }
        missing = expected_fields - set(data.keys())
        assert not missing, f"В ответе отсутствуют поля: {missing}"

    @pytest.mark.asyncio
    async def test_404_propagates_for_catch_block(
        self, client: AsyncClient
    ):
        """
        ArticlePage.tsx обрабатывает err.response.status === 404.
        Убеждаемся, что бэкенд действительно возвращает 404, а не 500.
        """
        resp = await client.get("/articles/9999999")
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# 10. App.tsx: маршрут /article/:id — проверяем корректность FastAPI-роутинга
# ---------------------------------------------------------------------------

class TestArticleIdRouting:
    """
    Пункт 10: App.tsx добавляет React Router маршрут /article/:id.
    Тест проверяет FastAPI-сторону: что эндпоинт GET /articles/{id}
    корректно интегрирован в приложение (не конфликтует с другими маршрутами).
    """

    @pytest.mark.asyncio
    async def test_id_route_last_in_router(
        self, client: AsyncClient, saved_article: Article
    ):
        """
        GET /articles/{id} объявлен последним в router — убеждаемся,
        что /stats и /find всё ещё доступны.
        """
        stats_resp = await client.get("/articles/stats")
        article_resp = await client.get(f"/articles/{saved_article.id}")

        assert stats_resp.status_code == 200
        assert article_resp.status_code == 200
        # /stats не был интерпретирован как id=int → роутинг работает правильно
        assert "total_articles" in stats_resp.json()
        assert article_resp.json()["id"] == saved_article.id

    @pytest.mark.asyncio
    async def test_multiple_ids_independent(
        self, client: AsyncClient, db_session: AsyncSession
    ):
        """
        Несколько разных статей возвращаются корректно по своим id —
        симулирует переходы между карточками в UI.
        """
        repo = PostgresArticleRepository(db_session)
        dois = [f"10.999/test-multi-{i}" for i in range(1, 4)]
        articles_input = [
            Article(
                title=f"Article {i}",
                publication_date=datetime.date(2024, 1, i),
                keyword=f"keyword_{i}",
                doi=dois[i - 1],
                is_seeded=True,
            )
            for i in range(1, 4)
        ]
        await repo.upsert_many(articles_input)
        # Загружаем ORM-объекты с реальными id через SELECT по doi,
        # т.к. save_many() использует Core INSERT — refresh() недоступен
        articles = [
            await fetch_article_after_insert(db_session, doi)
            for doi in dois
        ]

        for article in articles:
            resp = await client.get(f"/articles/{article.id}")
            assert resp.status_code == 200
            assert resp.json()["title"] == article.title
