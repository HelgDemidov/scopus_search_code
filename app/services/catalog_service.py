# Сервис каталога сидера — управляет статьями, добавленными автоматическим сидером
from __future__ import annotations

import json
import logging
from typing import TYPE_CHECKING, List

from sqlalchemy.ext.asyncio import AsyncSession

from app.interfaces.article_repository import IArticleRepository
from app.interfaces.catalog_repository import ICatalogRepository
from app.models.article import Article
from app.schemas.article_schemas import (
    ArticleResponse,
    CountByField,
    CountryImpactPoint,
    JournalCountryCount,
    JournalImpactPoint,
    KpiTotalsResponse,
    PaginatedArticleResponse,
    PivotDimension,
    PivotMetric,
    PivotResponse,
    StatsResponse,
    SunburstSegment,
    YearCountryCount,
)

if TYPE_CHECKING:
    from app.infrastructure.redis_client import UpstashRedisClient

from app.infrastructure.redis_client import (
    EXPLORE_STATS_CACHE_TTL,
    STATS_CACHE_TTL,
    make_catalog_count_cache_key,
    make_journal_impact_cache_key,
    make_kpi_totals_cache_key,
    make_stats_cache_key,
)

logger = logging.getLogger(__name__)


class CatalogService:
    # Верхняя граница точного подсчёта total для GET /articles (пагинация каталога).
    # За её пределами точный COUNT(*) по всей таблице доминирует над стоимостью запроса на
    # широких ILIKE-фильтрах без подходящего индекса (см. docs/project-meta/project_context — root cause
    # нагрузочного прогона 2026-07-09); показываем "cap+", а не точное число.
    TOTAL_COUNT_CAP = 2000

    # Значения слайдера "окно зрелости" Journal Landscape (JournalLandscapeScatterChart.tsx,
    # MATURITY_DEFAULT_YEAR=2024) — ровно 3 фиксированных года, прогреваются целиком в
    # refresh_explore_stats_cache(), т.к. пространство ключей крошечное (см. get_journal_impact).
    JOURNAL_IMPACT_WARM_YEARS: tuple[int, ...] = (2022, 2023, 2024)

    def __init__(
        self,
        article_repo: IArticleRepository,
        catalog_repo: ICatalogRepository,
        session: AsyncSession,
        redis: UpstashRedisClient | None = None,
        db_namespace: str = "",
    ):
        self.article_repo = article_repo
        self.catalog_repo = catalog_repo
        self.session = session
        self.redis = redis
        # Изолирует ключи кэша статистики от других окружений, делящих тот же
        # Redis (см. make_stats_cache_key в redis_client.py). Инъектируется DI
        # из settings.database_url_str — сервис не читает глобальный конфиг сам.
        self.db_namespace = db_namespace

    # ------------------------------------------------------------------ #
    #  get_catalog_paginated                                               #
    # ------------------------------------------------------------------ #

    async def get_catalog_paginated(
        self,
        page: int,
        size: int,
        keyword: str | None = None,
        search: str | None = None,
        year_from: int | None = None,
        year_to: int | None = None,
        doc_types: list[str] | None = None,
        open_access: bool | None = None,
        countries: list[str] | None = None,
    ) -> PaginatedArticleResponse:
        """Пагинированный список статей каталога с опциональными фильтрами.

        keyword:     точное совпадение по ключевому слову сидера.
        search:      ILIKE-поиск по title/author.
        year_from:   год публикации >= year_from.
        year_to:     год публикации <= year_to.
        doc_types:   фильтр по типам документов (список).
        open_access: True — только OA; False — только не-OA; None — все.
        countries:   фильтр по странам аффилиации (список).
        """
        # Защита от некорректных значений пагинации
        if page < 1:
            page = 1
        if size < 1:
            size = 10

        limit = size
        offset = (page - 1) * size

        # Два запроса с идентичными фильтрами: данные + COUNT для пагинации
        db_articles = await self.catalog_repo.get_all(
            limit=limit,
            offset=offset,
            keyword=keyword,
            search=search,
            year_from=year_from,
            year_to=year_to,
            doc_types=doc_types,
            open_access=open_access,
            countries=countries,
        )
        total, total_is_capped = await self._get_total_count(
            keyword=keyword,
            search=search,
            year_from=year_from,
            year_to=year_to,
            doc_types=doc_types,
            open_access=open_access,
            countries=countries,
        )

        # ORM-объекты → Pydantic-схемы
        article_responses = [ArticleResponse.model_validate(article) for article in db_articles]
        return PaginatedArticleResponse(items=article_responses, total=total, total_is_capped=total_is_capped)

    async def _get_total_count(
        self,
        keyword: str | None,
        search: str | None,
        year_from: int | None,
        year_to: int | None,
        doc_types: list[str] | None,
        open_access: bool | None,
        countries: list[str] | None,
    ) -> tuple[int, bool]:
        """Cache-aside вокруг catalog_repo.get_total_count — TTL=60s, паттерн как get_stats.

        Убивает повторную стоимость дорогого BitmapOr/seq-скана для одного и того же
        поискового терма в пределах TTL (docs/backend-performance/catalog-search-latency/spec.md §1).
        get_all() (сами строки страницы) кэшу не подлежит — должен оставаться live.
        Graceful degradation: redis=None или сбой Redis → прямой запрос, как в get_stats.
        """
        if self.redis is None:
            return await self.catalog_repo.get_total_count(
                cap=self.TOTAL_COUNT_CAP,
                keyword=keyword,
                search=search,
                year_from=year_from,
                year_to=year_to,
                doc_types=doc_types,
                open_access=open_access,
                countries=countries,
            )

        cache_key = make_catalog_count_cache_key(
            keyword, search, year_from, year_to, doc_types, open_access, countries, db_namespace=self.db_namespace
        )

        try:
            cached = await self.redis.get(cache_key)
            if cached is not None:
                data = json.loads(cached)
                return data["total"], data["capped"]
        except Exception:
            logger.warning("Redis GET failed, falling back to DB", exc_info=True)

        total, total_is_capped = await self.catalog_repo.get_total_count(
            cap=self.TOTAL_COUNT_CAP,
            keyword=keyword,
            search=search,
            year_from=year_from,
            year_to=year_to,
            doc_types=doc_types,
            open_access=open_access,
            countries=countries,
        )

        try:
            await self.redis.setex(
                cache_key, STATS_CACHE_TTL, json.dumps({"total": total, "capped": total_is_capped})
            )
        except Exception:
            logger.warning("Redis SETEX failed, cache skipped", exc_info=True)

        return total, total_is_capped

    # ------------------------------------------------------------------ #
    #  get_kpi_totals                                                      #
    # ------------------------------------------------------------------ #

    async def get_kpi_totals(self) -> KpiTotalsResponse:
        """6 скаляров для плиток KpiRow на /explore — быстрый фикс 2026-08-14.

        Cache-aside, EXPLORE_STATS_CACHE_TTL — тот же, что get_stats/get_journal_impact
        (не STATS_CACHE_TTL=60s у get_total_count, см. redis_client.py) — но свой, более
        узкий ключ (make_kpi_totals_cache_key, без хэша параметров: этот эндпоинт их не
        принимает). Отдельный кэш-энтри специально: плитки не должны ждать 9
        других агрегатов get_stats(), которые им не нужны, даже если оба сейчас
        холодные одновременно.
        """
        if self.redis is None:
            raw = await self.catalog_repo.get_kpi_totals()
            return KpiTotalsResponse(**raw)

        cache_key = make_kpi_totals_cache_key(db_namespace=self.db_namespace)

        try:
            cached = await self.redis.get(cache_key)
            if cached is not None:
                return KpiTotalsResponse.model_validate_json(cached)
        except Exception:
            logger.warning("Redis GET failed, falling back to DB", exc_info=True)

        raw = await self.catalog_repo.get_kpi_totals()
        result = KpiTotalsResponse(**raw)

        try:
            await self.redis.setex(cache_key, EXPLORE_STATS_CACHE_TTL, result.model_dump_json())
        except Exception:
            logger.warning("Redis SETEX failed, cache skipped", exc_info=True)

        return result

    # ------------------------------------------------------------------ #
    #  get_stats                                                           #
    # ------------------------------------------------------------------ #

    async def get_stats(
        self,
        countries: list[str] | None = None,
        doc_types: list[str] | None = None,
        open_access: bool | None = None,
        year_from: int | None = None,
        year_to: int | None = None,
    ) -> StatsResponse:
        """Агрегированная статистика по каталогу с опциональными фильтрами.

        Cache-aside: Redis TTL=EXPLORE_STATS_CACHE_TTL (5ч, см. redis_client.py) → при
        промахе запрос к БД → запись в кэш. На практике промах — редкость: refresh_explore_
        stats_cache() прогревает этот ключ проактивно на каждом прогоне сидера (piggyback,
        см. POST /seeder/refresh-stats-cache) — TTL здесь только safety net.
        Graceful degradation: если redis=None или Redis недоступен → прямой запрос к БД.
        """
        if self.redis is None:
            return await self._fetch_stats_from_db(countries, doc_types, open_access, year_from, year_to)

        cache_key = make_stats_cache_key(
            countries, doc_types, open_access, year_from, year_to, db_namespace=self.db_namespace
        )

        try:
            cached = await self.redis.get(cache_key)
            if cached is not None:
                return StatsResponse.model_validate_json(cached)
        except Exception:
            logger.warning("Redis GET failed, falling back to DB", exc_info=True)

        result = await self._fetch_stats_from_db(countries, doc_types, open_access, year_from, year_to)

        try:
            await self.redis.setex(cache_key, EXPLORE_STATS_CACHE_TTL, result.model_dump_json())
        except Exception:
            logger.warning("Redis SETEX failed, cache skipped", exc_info=True)

        return result

    async def _fetch_stats_from_db(
        self,
        countries: list[str] | None,
        doc_types: list[str] | None,
        open_access: bool | None,
        year_from: int | None,
        year_to: int | None,
    ) -> StatsResponse:
        raw = await self.catalog_repo.get_stats(
            countries=countries,
            doc_types=doc_types,
            open_access=open_access,
            year_from=year_from,
            year_to=year_to,
        )

        # Конвертируем сырые dict-списки в типизированные Pydantic-схемы
        return StatsResponse(
            total_articles=raw["total_articles"],
            total_journals=raw["total_journals"],
            total_countries=raw["total_countries"],
            total_authors=raw["total_authors"],
            open_access_count=raw["open_access_count"],
            by_year=[CountByField(label=str(r["year"]), count=r["count"]) for r in raw["by_year"]],
            by_journal=[CountByField(label=r["journal"], count=r["count"]) for r in raw["by_journal"]],
            by_country=[CountByField(label=r["country"], count=r["count"]) for r in raw["by_country"]],
            by_doc_type=[CountByField(label=r["doc_type"], count=r["count"]) for r in raw["by_doc_type"]],
            top_authors=[CountByField(label=r["author"], count=r["count"]) for r in raw["top_authors"]],
            by_year_top_countries=[
                YearCountryCount(year=r["year"], country=r["country"], count=r["count"])
                for r in raw["by_year_top_countries"]
            ],
            sunburst_country_open_access=[
                SunburstSegment(country=r["country"], open_access=r["open_access"], count=r["count"])
                for r in raw["sunburst_country_open_access"]
            ],
            top_journals_by_country=[
                JournalCountryCount(journal=r["journal"], country=r["country"], count=r["count"])
                for r in raw["top_journals_by_country"]
            ],
            country_impact=[
                CountryImpactPoint(country=r["country"], count=r["count"], mean_citations=r["mean_citations"])
                for r in raw["country_impact"]
            ],
        )

    # ------------------------------------------------------------------ #
    #  get_journal_impact — Journal Landscape Scatter                     #
    #  (docs/explore-analytics/explore-table-builder/spec.md §1)                            #
    # ------------------------------------------------------------------ #

    async def get_journal_impact(self, max_year: int) -> list[JournalImpactPoint]:
        """Топ-N журналов (объём×импакт) для интерактивного слайдера окна зрелости.

        Cache-aside, как get_stats — EXPLORE_STATS_CACHE_TTL, тот же db_namespace. В
        отличие от get_pivot (комбинаторно много пар измерений × slicer), max_year —
        слайдер ровно на 3 значения (JOURNAL_IMPACT_WARM_YEARS), кэшировать есть смысл:
        пространство ключей крошечное, а сам запрос — самый тяжёлый из 4 стационарных
        графиков /explore (единственный без готового statsStore под рукой на фронте).
        Все 3 значения прогреваются проактивно, см. refresh_explore_stats_cache().
        """
        if self.redis is None:
            return await self._fetch_journal_impact_from_db(max_year)

        cache_key = make_journal_impact_cache_key(max_year, db_namespace=self.db_namespace)

        try:
            cached = await self.redis.get(cache_key)
            if cached is not None:
                return [JournalImpactPoint(**r) for r in json.loads(cached)]
        except Exception:
            logger.warning("Redis GET failed, falling back to DB", exc_info=True)

        result = await self._fetch_journal_impact_from_db(max_year)

        try:
            payload = json.dumps([p.model_dump() for p in result])
            await self.redis.setex(cache_key, EXPLORE_STATS_CACHE_TTL, payload)
        except Exception:
            logger.warning("Redis SETEX failed, cache skipped", exc_info=True)

        return result

    async def _fetch_journal_impact_from_db(self, max_year: int) -> list[JournalImpactPoint]:
        raw = await self.catalog_repo.get_journal_impact(max_year=max_year)
        return [JournalImpactPoint(**r) for r in raw]

    # ------------------------------------------------------------------ #
    #  refresh_explore_stats_cache — piggyback на сидере                  #
    #  (docs/backend-performance/explore-cold-start-mitigation/spec.md §3.1)              #
    # ------------------------------------------------------------------ #

    async def refresh_explore_stats_cache(self) -> int:
        """Форсированно пересчитывает и перезаписывает Redis-кэш дефолтных (без
        фильтров) записей get_stats/get_kpi_totals/get_journal_impact сразу после
        того, как сидер изменил каталог — вместо ожидания истечения
        EXPLORE_STATS_CACHE_TTL реактивным первым посетителем /explore.

        Намеренно НЕ проверяет redis.get() перед записью — get_stats/get_kpi_totals/
        get_journal_impact уже используют cache-aside, и обычный вызов вернул бы уже
        закэшированное (возможно устаревшее) значение вместо новых данных.
        Прогревает только дефолтные записи (без фильтров, все 3 значения
        JOURNAL_IMPACT_WARM_YEARS) — тот же принцип, что у /stats/pivot: не
        пытаемся прогреть комбинаторный фильтрованный хвост.

        Возвращает число успешно записанных ключей (0-5) — не бросает исключение
        при сбое отдельной записи в Redis, каждая обрабатывается независимо
        (частичный успех лучше, чем полный откат из-за одного transient-сбоя).
        """
        if self.redis is None:
            return 0

        refreshed = 0

        stats = await self._fetch_stats_from_db(None, None, None, None, None)
        try:
            await self.redis.setex(
                make_stats_cache_key(None, None, None, None, None, db_namespace=self.db_namespace),
                EXPLORE_STATS_CACHE_TTL,
                stats.model_dump_json(),
            )
            refreshed += 1
        except Exception:
            logger.warning("Redis SETEX failed during explore-stats refresh (get_stats)", exc_info=True)

        kpi_raw = await self.catalog_repo.get_kpi_totals()
        kpi = KpiTotalsResponse(**kpi_raw)
        try:
            await self.redis.setex(
                make_kpi_totals_cache_key(db_namespace=self.db_namespace),
                EXPLORE_STATS_CACHE_TTL,
                kpi.model_dump_json(),
            )
            refreshed += 1
        except Exception:
            logger.warning("Redis SETEX failed during explore-stats refresh (get_kpi_totals)", exc_info=True)

        for year in self.JOURNAL_IMPACT_WARM_YEARS:
            points = await self._fetch_journal_impact_from_db(year)
            try:
                await self.redis.setex(
                    make_journal_impact_cache_key(year, db_namespace=self.db_namespace),
                    EXPLORE_STATS_CACHE_TTL,
                    json.dumps([p.model_dump() for p in points]),
                )
                refreshed += 1
            except Exception:
                logger.warning(
                    "Redis SETEX failed during explore-stats refresh (get_journal_impact, year=%s)",
                    year,
                    exc_info=True,
                )

        return refreshed

    # ------------------------------------------------------------------ #
    #  get_pivot — Table Builder                                          #
    #  (docs/explore-analytics/explore-table-builder/spec.md §3)                            #
    # ------------------------------------------------------------------ #

    async def get_pivot(
        self,
        row_dim: PivotDimension,
        col_dim: PivotDimension,
        top_n_rows: int,
        top_n_cols: int,
        filter_dim: PivotDimension | None = None,
        filter_value: str | None = None,
        metric: PivotMetric = "count",
    ) -> PivotResponse:
        """2D pivot по 2 измерениям + опциональный slicer. Без кэша, в отличие от
        get_journal_impact (там слайдер всего на 3 значения) — комбинаторное
        пространство row_dim×col_dim×filter_dim×filter_value в Table Builder
        слишком велико, чтобы кэш давал разумный hit rate.

        Проверка допустимости конкретной ПАРЫ измерений (§3.1) и row_dim != col_dim —
        на уровне роутера (это HTTP-контракт, а не бизнес-правило самого сервиса).
        metric не влияет на top-N отбор строк/столбцов (docs/explore-analytics/impact-analytics/spec.md §0.2) —
        только на то, что именно попадает в matrix.
        """
        raw = await self.catalog_repo.get_pivot(
            row_dim=row_dim,
            col_dim=col_dim,
            top_n_rows=top_n_rows,
            top_n_cols=top_n_cols,
            filter_dim=filter_dim,
            filter_value=filter_value,
            metric=metric,
        )
        return PivotResponse(row_dim=row_dim, col_dim=col_dim, metric=metric, **raw)

    # ------------------------------------------------------------------ #
    #  seed                                                                #
    # ------------------------------------------------------------------ #

    async def seed(
        self,
        articles: List[Article],
        keyword: str,
    ) -> List[Article]:
        """Сохраняет статьи сидера: upsert в articles → запись в catalog_articles.

        Единственный метод, который вызывает commit().
        Атомарность: либо обе таблицы обновлены, либо ни одна.
        Вызывающий код (сидер) не должен делать commit().
        """
        # Шаг 1: upsert в таблицу articles — получаем статьи с id из БД
        articles_with_ids = await self.article_repo.upsert_many(articles)

        # Шаг 2: запись в catalog_articles (ON CONFLICT DO NOTHING)
        await self.catalog_repo.save_seeded(articles_with_ids, keyword)

        # Шаг 3: фиксируем транзакцию — обе операции атомарны
        await self.session.commit()

        return articles_with_ids
