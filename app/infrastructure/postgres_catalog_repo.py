import statistics
from datetime import date
from typing import Any, List

import sqlalchemy as sa
from sqlalchemy import extract, func, select, text
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.interfaces.catalog_repository import ICatalogRepository
from app.models.article import Article
from app.models.catalog_article import CatalogArticle
from app.utils.db_utils import escape_ilike


class PostgresCatalogRepository(ICatalogRepository):
    def __init__(self, session: AsyncSession):
        self.session = session

    # ------------------------------------------------------------------ #
    #  _apply_filters — приватный хелпер                                  #
    # ------------------------------------------------------------------ #

    def _apply_filters(
        self,
        stmt: sa.Select,
        keyword: str | None,
        search: str | None,
        year_from: int | None,
        year_to: int | None,
        doc_types: list[str] | None,
        open_access: bool | None,
        countries: list[str] | None,
    ) -> sa.Select:
        """Применяет все активные фильтры к переданному SELECT-стейтменту.

        Используется в get_all() и get_total_count() — единственный источник WHERE-логики.
        Не добавляет ORDER BY, LIMIT, OFFSET — ответственность вызывающего кода.
        """
        # Фильтр по ключевому слову сидера (точное совпадение)
        if keyword is not None:
            stmt = stmt.where(CatalogArticle.keyword == keyword)

        # ILIKE-фильтр по заголовку или автору (экранируем спецсимволы)
        if search is not None:
            pattern = f"%{escape_ilike(search)}%"
            stmt = stmt.where(
                sa.or_(
                    Article.title.ilike(pattern),
                    Article.author.ilike(pattern),
                )
            )

        # Фильтр по нижней границе года публикации
        if year_from is not None:
            stmt = stmt.where(extract("year", Article.publication_date) >= year_from)

        # Фильтр по верхней границе года публикации
        if year_to is not None:
            stmt = stmt.where(extract("year", Article.publication_date) <= year_to)

        # Фильтр по типам документов — case-insensitive IN-список
        if doc_types:
            stmt = stmt.where(func.lower(Article.document_type).in_([dt.lower() for dt in doc_types]))

        # Фильтр по open access (True / False / None — все)
        if open_access is not None:
            stmt = stmt.where(Article.open_access.is_(open_access))

        # Фильтр по странам аффилиации — case-insensitive IN-список
        if countries:
            stmt = stmt.where(func.lower(Article.affiliation_country).in_([c.lower() for c in countries]))

        return stmt

    # ------------------------------------------------------------------ #
    #  get_all                                                             #
    # ------------------------------------------------------------------ #

    async def get_all(
        self,
        limit: int,
        offset: int,
        keyword: str | None = None,
        search: str | None = None,
        year_from: int | None = None,
        year_to: int | None = None,
        doc_types: list[str] | None = None,
        open_access: bool | None = None,
        countries: list[str] | None = None,
    ) -> List[Article]:
        """Статьи каталога с пагинацией и опциональными фильтрами.

        keyword: точное совпадение catalog_articles.keyword (ключевое слово сидера).
        search:  ILIKE-поиск по title и author через escape_ilike().
        """
        # Базовый запрос: JOIN catalog_articles → articles через article_id
        stmt = select(Article).join(CatalogArticle, CatalogArticle.article_id == Article.id)

        # Все WHERE-клаузы через единый хелпер
        stmt = self._apply_filters(stmt, keyword, search, year_from, year_to, doc_types, open_access, countries)

        # Сортировка по дате публикации: свежие статьи первыми
        stmt = stmt.order_by(Article.publication_date.desc()).limit(limit).offset(offset)

        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    # ------------------------------------------------------------------ #
    #  get_total_count                                                     #
    # ------------------------------------------------------------------ #

    async def get_total_count(
        self,
        cap: int,
        keyword: str | None = None,
        search: str | None = None,
        year_from: int | None = None,
        year_to: int | None = None,
        doc_types: list[str] | None = None,
        open_access: bool | None = None,
        countries: list[str] | None = None,
    ) -> tuple[int, bool]:
        """COUNT с теми же фильтрами что get_all — для корректной пагинации.

        Кап через подзапрос с LIMIT cap+1: на широких ILIKE-фильтрах без подходящего индекса
        (title/author) точный COUNT(*) по всей таблице — доминирующая стоимость запроса
        (сканирует всё, LIMIT в обычном SELECT его не ускоряет). Обёртка LIMIT позволяет
        планировщику прервать скан, как только найдено cap+1 совпадений, независимо от
        реальной селективности фильтра.
        """
        # Подзапрос: те же JOIN + WHERE, что get_all, но без ORDER BY — с LIMIT cap+1
        inner_stmt = (
            select(sa.literal(1))
            .select_from(Article)
            .join(CatalogArticle, CatalogArticle.article_id == Article.id)
        )
        inner_stmt = self._apply_filters(
            inner_stmt, keyword, search, year_from, year_to, doc_types, open_access, countries
        )
        capped_subquery = inner_stmt.limit(cap + 1).subquery()

        result = await self.session.execute(select(func.count()).select_from(capped_subquery))
        raw_count = result.scalar_one()

        if raw_count > cap:
            return cap, True
        return raw_count, False

    # ------------------------------------------------------------------ #
    #  save_seeded                                                         #
    # ------------------------------------------------------------------ #

    async def save_seeded(
        self,
        articles: List[Article],
        keyword: str,
    ) -> List[Article]:
        """Записывает статьи сидера в catalog_articles.

        Предполагает, что articles уже сохранены в таблице articles
        (т.е. имеют заполненный id после upsert_many в article_repo).
        ON CONFLICT DO NOTHING: повторный вызов с теми же статьями идемпотентен.
        Только flush() — commit() остаётся за CatalogService.
        """
        if not articles:
            return articles

        # Батчевый INSERT в catalog_articles
        values = [
            {
                "article_id": a.id,
                "keyword": keyword,
            }
            for a in articles
        ]
        stmt = (
            insert(CatalogArticle)
            .values(values)
            # uq_catalog_articles_article_id: каждая статья в каталоге не более одного раза
            .on_conflict_do_nothing(constraint="uq_catalog_articles_article_id")
        )
        await self.session.execute(stmt)
        await self.session.flush()

        return articles

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
    ) -> dict:
        """Агрегированная статистика по каталогу с опциональными фильтрами.

        Переиспользует _apply_filters() — единственный источник WHERE-логики.
        Без фильтров поведение идентично V1 (полная статистика каталога).
        """
        # SET LOCAL устраняет disk spill при COUNT(DISTINCT ...) sort — только PG
        # SQLite в тестах не поддерживает SET LOCAL, поэтому проверяем диалект
        conn = await self.session.connection()
        if conn.dialect.name == "postgresql":
            await self.session.execute(text("SET LOCAL work_mem = '32MB'"))

        # Базовый запрос: только статьи из catalog_articles (JOIN вместо CTE)
        stmt = select(Article).join(CatalogArticle, CatalogArticle.article_id == Article.id)
        stmt = self._apply_filters(
            stmt,
            keyword=None,
            search=None,
            year_from=year_from,
            year_to=year_to,
            doc_types=doc_types,
            open_access=open_access,
            countries=countries,
        )

        # Базовый подзапрос — переиспользуем во всех агрегатах ниже
        catalog_articles_q = stmt.subquery()

        # Итоговые счётчики
        totals = await self.session.execute(
            select(
                func.count().label("total_articles"),
                func.count(catalog_articles_q.c.journal.distinct()).label("total_journals"),
                func.count(catalog_articles_q.c.affiliation_country.distinct()).label("total_countries"),
                func.count(catalog_articles_q.c.author.distinct()).label("total_authors"),
                func.sum(
                    sa.cast(
                        sa.case((catalog_articles_q.c.open_access.is_(True), 1), else_=0),
                        sa.Integer,
                    )
                ).label("open_access_count"),
            ).select_from(catalog_articles_q)
        )
        row = totals.one()

        # Распределение по годам
        by_year_rows = await self.session.execute(
            select(
                func.extract("year", catalog_articles_q.c.publication_date).label("year"),
                func.count().label("count"),
            )
            .select_from(catalog_articles_q)
            .group_by(sa.text("year"))
            .order_by(sa.text("year DESC"))
        )

        # Распределение по журналам (топ-20). Материализуем в список сразу (.all()) —
        # ниже переиспользуем топ-10 label'ов для кросс-агрегата top_journals_by_country,
        # а результат execute() иначе можно проитерировать только один раз.
        by_journal_rows = (
            await self.session.execute(
                select(
                    catalog_articles_q.c.journal,
                    func.count().label("count"),
                )
                .select_from(catalog_articles_q)
                .where(catalog_articles_q.c.journal.isnot(None))
                .group_by(catalog_articles_q.c.journal)
                .order_by(sa.text("count DESC"))
                .limit(20)
            )
        ).all()

        # Распределение по странам — аналогично материализуем для переиспользования
        # топ-5/топ-10 label'ов в 3 кросс-агрегатах ниже (garantируем, что топ-N
        # везде на странице совпадает — см. docs/explore-cross-analytics/spec.md §2.2)
        by_country_rows = (
            await self.session.execute(
                select(
                    catalog_articles_q.c.affiliation_country,
                    func.count().label("count"),
                )
                .select_from(catalog_articles_q)
                .where(catalog_articles_q.c.affiliation_country.isnot(None))
                .group_by(catalog_articles_q.c.affiliation_country)
                .order_by(sa.text("count DESC"))
                .limit(20)
            )
        ).all()

        # Распределение по типам документов — материализуем для топ-5 фиксированного
        # набора типов документа, используемого в sunburst (см. ниже)
        by_doc_type_rows = (
            await self.session.execute(
                select(
                    catalog_articles_q.c.document_type,
                    func.count().label("count"),
                )
                .select_from(catalog_articles_q)
                .where(catalog_articles_q.c.document_type.isnot(None))
                .group_by(catalog_articles_q.c.document_type)
                .order_by(sa.text("count DESC"))
            )
        ).all()

        # ------------------------------------------------------------------ #
        #  Кросс-агрегаты для стационарных графиков /explore                  #
        #  (docs/explore-cross-analytics/spec.md §2.2)                        #
        # ------------------------------------------------------------------ #
        top10_countries = [r.affiliation_country for r in by_country_rows[:10]]
        top5_countries = [r.affiliation_country for r in by_country_rows[:5]]
        top10_journals = [r.journal for r in by_journal_rows[:10]]

        # График 1 — Top Countries by Year: топ-10 стран × год
        by_year_top_countries_rows = await self.session.execute(
            select(
                func.extract("year", catalog_articles_q.c.publication_date).label("year"),
                catalog_articles_q.c.affiliation_country,
                func.count().label("count"),
            )
            .select_from(catalog_articles_q)
            .where(catalog_articles_q.c.affiliation_country.in_(top10_countries))
            .group_by(sa.text("year"), catalog_articles_q.c.affiliation_country)
            .order_by(sa.text("year DESC"))
        )

        # График 2 — Sunburst Country(топ-5) → OpenAccess. Изначально был 3-уровневым
        # (+ DocType посередине), упрощён до 2 уровней по итогам визуального ревью —
        # третий слой был нечитаем, см. docs/explore-cross-analytics/spec.md §5.
        sunburst_rows = await self.session.execute(
            select(
                catalog_articles_q.c.affiliation_country,
                catalog_articles_q.c.open_access,
                func.count().label("count"),
            )
            .select_from(catalog_articles_q)
            .where(
                catalog_articles_q.c.affiliation_country.in_(top5_countries),
                catalog_articles_q.c.open_access.isnot(None),
            )
            .group_by(catalog_articles_q.c.affiliation_country, catalog_articles_q.c.open_access)
        )

        # График 3 — Top Journals × Country: топ-10 журналов, страны бакетированы
        # в тот же топ-5 + Other, что sunburst — единая легенда стран по дашборду.
        country_col = catalog_articles_q.c.affiliation_country
        country_bucket = sa.case(
            (country_col.in_(top5_countries), country_col),
            else_=sa.literal("Other"),
        ).label("country_bucket")
        top_journals_by_country_rows = await self.session.execute(
            select(
                catalog_articles_q.c.journal,
                country_bucket,
                func.count().label("count"),
            )
            .select_from(catalog_articles_q)
            .where(
                catalog_articles_q.c.journal.in_(top10_journals),
                catalog_articles_q.c.affiliation_country.isnot(None),
            )
            .group_by(catalog_articles_q.c.journal, country_bucket)
        )

        # Топ ключевых слов из catalog_articles.keyword (legacy — не отображается в UI)
        top_keywords_rows = await self.session.execute(
            select(
                CatalogArticle.keyword,
                func.count().label("count"),
            )
            .group_by(CatalogArticle.keyword)
            .order_by(sa.text("count DESC"))
            .limit(20)
        )

        # Топ-20 авторов по числу статей в каталоге
        top_authors_rows = await self.session.execute(
            select(
                catalog_articles_q.c.author,
                func.count().label("count"),
            )
            .select_from(catalog_articles_q)
            .where(catalog_articles_q.c.author.isnot(None))
            .group_by(catalog_articles_q.c.author)
            .order_by(sa.text("count DESC"))
            .limit(20)
        )

        return {
            "total_articles": row.total_articles,
            "total_journals": row.total_journals,
            "total_countries": row.total_countries,
            "total_authors": row.total_authors or 0,
            "open_access_count": row.open_access_count or 0,
            "by_year": [{"year": int(r.year), "count": r.count} for r in by_year_rows],
            "by_journal": [{"journal": r.journal, "count": r.count} for r in by_journal_rows],
            "by_country": [{"country": r.affiliation_country, "count": r.count} for r in by_country_rows],
            "by_doc_type": [{"doc_type": r.document_type, "count": r.count} for r in by_doc_type_rows],
            "top_keywords": [{"keyword": r.keyword, "count": r.count} for r in top_keywords_rows],
            "top_authors": [{"author": r.author, "count": r.count} for r in top_authors_rows],
            "by_year_top_countries": [
                {"year": int(r.year), "country": r.affiliation_country, "count": r.count}
                for r in by_year_top_countries_rows
            ],
            "sunburst_country_open_access": [
                {"country": r.affiliation_country, "open_access": r.open_access, "count": r.count}
                for r in sunburst_rows
            ],
            "top_journals_by_country": [
                {"journal": r.journal, "country": r.country_bucket, "count": r.count}
                for r in top_journals_by_country_rows
            ],
        }

    # ------------------------------------------------------------------ #
    #  get_journal_impact — Journal Landscape Scatter                     #
    #  (docs/explore-table-builder/spec.md §1)                            #
    # ------------------------------------------------------------------ #

    _JOURNAL_IMPACT_MIN_COUNT = 20
    _JOURNAL_IMPACT_TOP_N = 40

    async def get_journal_impact(self, max_year: int) -> list[dict]:
        """Топ-N журналов (объём + среднее/медианное цитирование) среди статей <= max_year.

        На Postgres медиана считается в самой БД через percentile_cont(0.5) WITHIN
        GROUP — один запрос вместо двух, без переноса сырых cited_by_count по сети
        и без Python-цикла (было раньше: portable count/avg + отдельный запрос
        сырых значений + statistics.median). SQLite (юнит/интеграционные тесты)
        percentile_cont не поддерживает — там сохранён прежний двухзапросный путь.
        coalesce(cited_by_count, 0) внутри percentile_cont — тот же null→0, что и
        Python-фолбэк (r.cited_by_count or 0), иначе медиана тихо разошлась бы
        между диалектами на статьях без cited_by_count.

        Фильтр по году — sargable-диапазон (< 1 января следующего года), не
        extract(year FROM publication_date) <= max_year: функция над колонкой не может
        использовать обычный btree-индекс на publication_date (root cause прогона
        2026-07-09, Шаг 3 индексирования — docs/project_context/...).
        """
        stmt = (
            select(Article)
            .join(CatalogArticle, CatalogArticle.article_id == Article.id)
            .where(
                Article.journal.isnot(None),
                Article.publication_date < date(max_year + 1, 1, 1),
            )
        )
        catalog_articles_q = stmt.subquery()

        conn = await self.session.connection()
        if conn.dialect.name == "postgresql":
            rows = (
                await self.session.execute(
                    select(
                        catalog_articles_q.c.journal,
                        func.count().label("count"),
                        func.avg(catalog_articles_q.c.cited_by_count).label("mean_citations"),
                        func.percentile_cont(0.5)
                        .within_group(func.coalesce(catalog_articles_q.c.cited_by_count, 0).asc())
                        .label("median_citations"),
                    )
                    .select_from(catalog_articles_q)
                    .group_by(catalog_articles_q.c.journal)
                    .having(func.count() >= self._JOURNAL_IMPACT_MIN_COUNT)
                    .order_by(sa.text("count DESC"))
                    .limit(self._JOURNAL_IMPACT_TOP_N)
                )
            ).all()

            return [
                {
                    "journal": r.journal,
                    "count": r.count,
                    "mean_citations": float(r.mean_citations or 0),
                    "median_citations": float(r.median_citations or 0),
                }
                for r in rows
            ]

        # SQLite (тесты) — без percentile_cont: portable агрегат + сырые значения + Python-медиана
        top_rows = (
            await self.session.execute(
                select(
                    catalog_articles_q.c.journal,
                    func.count().label("count"),
                    func.avg(catalog_articles_q.c.cited_by_count).label("mean_citations"),
                )
                .select_from(catalog_articles_q)
                .group_by(catalog_articles_q.c.journal)
                .having(func.count() >= self._JOURNAL_IMPACT_MIN_COUNT)
                .order_by(sa.text("count DESC"))
                .limit(self._JOURNAL_IMPACT_TOP_N)
            )
        ).all()

        if not top_rows:
            return []

        top_journals = [r.journal for r in top_rows]

        # Медиана — только по журналам из top_rows, не по всему окну зрелости
        raw_rows = await self.session.execute(
            select(
                catalog_articles_q.c.journal,
                catalog_articles_q.c.cited_by_count,
            )
            .select_from(catalog_articles_q)
            .where(catalog_articles_q.c.journal.in_(top_journals))
        )
        citations_by_journal: dict[str, list[int]] = {j: [] for j in top_journals}
        for r in raw_rows:
            citations_by_journal[r.journal].append(r.cited_by_count or 0)

        return [
            {
                "journal": r.journal,
                "count": r.count,
                "mean_citations": float(r.mean_citations or 0),
                "median_citations": float(statistics.median(citations_by_journal[r.journal])),
            }
            for r in top_rows
        ]

    # ------------------------------------------------------------------ #
    #  get_pivot — Table Builder                                          #
    #  (docs/explore-table-builder/spec.md §3)                            #
    # ------------------------------------------------------------------ #

    _PIVOT_DIMENSIONS = frozenset({"year", "country", "doc_type", "journal", "open_access"})

    @staticmethod
    def _pivot_label(dim: str, value: Any) -> str:
        if dim == "year":
            return str(int(value))
        if dim == "open_access":
            return "true" if value else "false"
        return str(value)

    async def get_pivot(
        self,
        row_dim: str,
        col_dim: str,
        top_n_rows: int,
        top_n_cols: int,
        filter_dim: str | None = None,
        filter_value: str | None = None,
    ) -> dict:
        """2D pivot по 2 whitelisted измерениям + опциональный slicer (3-е измерение как фильтр).

        Whitelist (_PIVOT_DIMENSIONS) — второй эшелон защиты от SQL-инъекции: row_dim/col_dim/
        filter_dim уже ограничены типом PivotDimension на уровне роутера (Literal → 422 до
        вызова репозитория), здесь — явная проверка вместо слепой интерполяции строки в запрос.
        top_n_rows/top_n_cols — обрезка по маржинальному объёму каждого измерения ДО пересечения
        друг с другом (country/journal высококардинальны — без обрезки pivot нечитаем).
        """
        if row_dim not in self._PIVOT_DIMENSIONS or col_dim not in self._PIVOT_DIMENSIONS:
            raise ValueError(f"Unknown pivot dimension: {row_dim!r}/{col_dim!r}")

        article_columns = {
            "year": func.extract("year", Article.publication_date),
            "country": Article.affiliation_country,
            "doc_type": Article.document_type,
            "journal": Article.journal,
            "open_access": Article.open_access,
        }

        stmt = select(Article).join(CatalogArticle, CatalogArticle.article_id == Article.id)

        if filter_dim is not None and filter_value is not None:
            if filter_dim not in self._PIVOT_DIMENSIONS:
                raise ValueError(f"Unknown pivot filter dimension: {filter_dim!r}")
            filter_col = article_columns[filter_dim]
            if filter_dim == "year":
                stmt = stmt.where(filter_col == int(filter_value))
            elif filter_dim == "open_access":
                stmt = stmt.where(filter_col.is_(filter_value.lower() == "true"))
            else:
                stmt = stmt.where(func.lower(filter_col) == filter_value.lower())

        catalog_articles_q = stmt.subquery()

        cq_columns = {
            "year": func.extract("year", catalog_articles_q.c.publication_date),
            "country": catalog_articles_q.c.affiliation_country,
            "doc_type": catalog_articles_q.c.document_type,
            "journal": catalog_articles_q.c.journal,
            "open_access": catalog_articles_q.c.open_access,
        }
        row_col = cq_columns[row_dim]
        col_col = cq_columns[col_dim]

        # Маржинальные top-N по объёму — до пересечения друг с другом
        row_rows = (
            await self.session.execute(
                select(row_col.label("value"), func.count().label("count"))
                .select_from(catalog_articles_q)
                .where(row_col.isnot(None))
                .group_by(row_col)
                .order_by(sa.text("count DESC"))
                .limit(top_n_rows)
            )
        ).all()
        col_rows = (
            await self.session.execute(
                select(col_col.label("value"), func.count().label("count"))
                .select_from(catalog_articles_q)
                .where(col_col.isnot(None))
                .group_by(col_col)
                .order_by(sa.text("count DESC"))
                .limit(top_n_cols)
            )
        ).all()

        if not row_rows or not col_rows:
            return {"row_labels": [], "col_labels": [], "matrix": [], "row_totals": [], "col_totals": []}

        row_values = [r.value for r in row_rows]
        col_values = [r.value for r in col_rows]

        matrix_rows = await self.session.execute(
            select(row_col.label("row_value"), col_col.label("col_value"), func.count().label("n"))
            .select_from(catalog_articles_q)
            .where(row_col.in_(row_values), col_col.in_(col_values))
            .group_by(row_col, col_col)
        )
        # Лейбл "n", не "count" — Row наследует tuple.count(), mypy иначе резолвит
        # r.count как метод (Callable), а не как подписанную колонку.
        cell_lookup: dict[tuple, int] = {(r.row_value, r.col_value): r.n for r in matrix_rows}

        matrix = [[cell_lookup.get((rv, cv), 0) for cv in col_values] for rv in row_values]

        return {
            "row_labels": [self._pivot_label(row_dim, v) for v in row_values],
            "col_labels": [self._pivot_label(col_dim, v) for v in col_values],
            "matrix": matrix,
            "row_totals": [r.count for r in row_rows],
            "col_totals": [r.count for r in col_rows],
        }
