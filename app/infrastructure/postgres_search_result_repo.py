import datetime
from typing import List

import sqlalchemy as sa
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.interfaces.search_result_repo import ISearchResultRepository
from app.models.article import Article
from app.models.search_history import SearchHistory
from app.models.search_result_article import SearchResultArticle
from app.utils.db_utils import escape_ilike


class PostgresSearchResultRepository(ISearchResultRepository):
    def __init__(self, session: AsyncSession):
        self.session = session

    # ------------------------------------------------------------------ #
    #  save_results                                                        #
    # ------------------------------------------------------------------ #

    async def save_results(
        self,
        search_history_id: int,
        articles: List[Article],
    ) -> None:
        """Батчевый INSERT статей поиска в search_result_articles с сохранением rank.

        rank = порядковый индекс статьи в выдаче Scopus (0-based).
        articles должны иметь заполненный id (после upsert_many в article_repo).
        Только flush() — commit() остаётся за SearchService.
        """
        if not articles:
            return

        # Формируем батч с rank = позиция в списке Scopus-выдачи
        values = [
            {
                "search_history_id": search_history_id,
                "article_id": article.id,
                "rank": rank,
            }
            for rank, article in enumerate(articles)
        ]
        # ON CONFLICT DO NOTHING: защита от повторного вызова с теми же данными
        stmt = (
            insert(SearchResultArticle).values(values).on_conflict_do_nothing(constraint="uq_sra_history_article")
        )
        await self.session.execute(stmt)
        await self.session.flush()

    # ------------------------------------------------------------------ #
    #  get_results_by_history_id                                          #
    # ------------------------------------------------------------------ #

    async def get_results_by_history_id(
        self,
        search_history_id: int,
        user_id: int,
    ) -> List[Article] | None:
        """Статьи конкретного поиска, упорядоченные по rank.

        Один атомарный JOIN-запрос с проверкой ownership:
        search_history.user_id должен совпадать с user_id.
        Возвращает None если запись поиска не найдена или принадлежит другому пользователю.
        TOCTOU-safe: нет раздельных SELECT — одна атомарная транзакция.
        """
        # Проверяем ownership записи поиска: EXISTS (search_history WHERE id AND user_id)
        ownership_check = await self.session.execute(
            select(SearchHistory.id).where(
                SearchHistory.id == search_history_id,
                SearchHistory.user_id == user_id,
            )
        )
        if ownership_check.scalar_one_or_none() is None:
            # Запись не найдена или принадлежит другому пользователю
            return None

        # Статьи поиска, отсортированные по rank (порядок из Scopus-выдачи)
        result = await self.session.execute(
            select(Article)
            .join(
                SearchResultArticle,
                SearchResultArticle.article_id == Article.id,
            )
            .where(SearchResultArticle.search_history_id == search_history_id)
            .order_by(SearchResultArticle.rank)
        )
        return list(result.scalars().all())

    # ------------------------------------------------------------------ #
    #  get_search_stats_for_user                                          #
    # ------------------------------------------------------------------ #

    async def get_search_stats_for_user(
        self,
        user_id: int,
        search: str | None = None,
        since: datetime.datetime | None = None,
    ) -> dict:
        """Агрегаты по статьям из поисков конкретного пользователя.

        Фильтрует по search_history.user_id, опционально:
        search: ILIKE по title/author статей через escape_ilike().
        since:  только поиски начиная с этой даты (search_history.created_at >= since).
        """
        # Субзапрос: search_history_id поисков пользователя с опциональным since-фильтром
        history_ids_q = select(SearchHistory.id).where(SearchHistory.user_id == user_id)
        if since is not None:
            history_ids_q = history_ids_q.where(SearchHistory.created_at >= since)
        history_ids_sq = history_ids_q.subquery()

        # Базовый JOIN: article через search_result_articles → отфильтрованные поиски
        base_q = (
            select(Article)
            .join(
                SearchResultArticle,
                SearchResultArticle.article_id == Article.id,
            )
            .where(SearchResultArticle.search_history_id.in_(select(history_ids_sq.c.id)))
        )

        # Опциональный ILIKE-фильтр по заголовку или автору
        if search is not None:
            pattern = f"%{escape_ilike(search)}%"
            base_q = base_q.where(
                sa.or_(
                    Article.title.ilike(pattern),
                    Article.author.ilike(pattern),
                )
            )

        # Оборачиваем в subquery для агрегатов. distinct() без аргумента, а не
        # distinct(Article.id) — DISTINCT ON поддерживает только PG-диалект (SQLite
        # тихо игнорирует ON и роняет deprecation warning, в будущих версиях
        # SQLAlchemy это CompileError). base_q селектит только колонки Article
        # (select(Article)), поэтому обычный DISTINCT по всем колонкам эквивалентен
        # DISTINCT ON (id) — id входит в набор колонок и является PK.
        articles_sq = base_q.distinct().subquery()

        # Итоговый счётчик
        total_row = await self.session.execute(select(func.count()).select_from(articles_sq))
        total = total_row.scalar_one()

        # Распределение по годам
        by_year_rows = await self.session.execute(
            select(
                func.extract("year", articles_sq.c.publication_date).label("year"),
                func.count().label("count"),
            )
            .select_from(articles_sq)
            .group_by(sa.text("year"))
            .order_by(sa.text("year DESC"))
        )

        # Распределение по журналам (топ-20)
        by_journal_rows = await self.session.execute(
            select(
                articles_sq.c.journal,
                func.count().label("count"),
            )
            .select_from(articles_sq)
            .where(articles_sq.c.journal.isnot(None))
            .group_by(articles_sq.c.journal)
            .order_by(sa.text("count DESC"))
            .limit(20)
        )

        # Распределение по странам (топ-20)
        by_country_rows = await self.session.execute(
            select(
                articles_sq.c.affiliation_country,
                func.count().label("count"),
            )
            .select_from(articles_sq)
            .where(articles_sq.c.affiliation_country.isnot(None))
            .group_by(articles_sq.c.affiliation_country)
            .order_by(sa.text("count DESC"))
            .limit(20)
        )

        # Распределение по типам документов
        by_doc_type_rows = await self.session.execute(
            select(
                articles_sq.c.document_type,
                func.count().label("count"),
            )
            .select_from(articles_sq)
            .where(articles_sq.c.document_type.isnot(None))
            .group_by(articles_sq.c.document_type)
            .order_by(sa.text("count DESC"))
        )

        # Распределение по Open Access (docs/personal-search-data/spec.md §2.1) —
        # единственное осмысленное новое категориальное измерение: bool → 2 бакета
        by_open_access_rows = await self.session.execute(
            select(
                articles_sq.c.open_access,
                func.count().label("count"),
            )
            .select_from(articles_sq)
            .where(articles_sq.c.open_access.isnot(None))
            .group_by(articles_sq.c.open_access)
            .order_by(sa.text("count DESC"))
        )

        return {
            "total": total,
            "by_year": [{"year": int(r.year), "count": r.count} for r in by_year_rows],
            "by_journal": [{"journal": r.journal, "count": r.count} for r in by_journal_rows],
            "by_country": [{"country": r.affiliation_country, "count": r.count} for r in by_country_rows],
            "by_doc_type": [{"doc_type": r.document_type, "count": r.count} for r in by_doc_type_rows],
            "by_open_access": [{"open_access": r.open_access, "count": r.count} for r in by_open_access_rows],
        }

    # ------------------------------------------------------------------ #
    #  get_personal_activity_for_user                                     #
    # ------------------------------------------------------------------ #

    async def get_personal_activity_for_user(self, user_id: int) -> dict:
        """Поисковая активность пользователя по времени (docs/explore-personal-
        redesign/spec.md §2.1). Грануляция и группировка по периодам — в Python
        (не date_trunc/strftime) — портируемо между PG и SQLite, тот же принцип,
        что медиана в CatalogRepository.get_journal_impact.
        """
        history_rows = (
            await self.session.execute(
                select(SearchHistory.created_at, SearchHistory.result_count)
                .where(SearchHistory.user_id == user_id)
                .order_by(SearchHistory.created_at)
            )
        ).all()

        if not history_rows:
            return {"granularity": "week", "buckets": []}

        # Авто-грануляция: активный пользователь заполняет HISTORY_DEPTH_LIMIT=100
        # за недели, редкий — за месяцы; фиксированная грануляция была бы либо
        # пустой, либо нечитаемой (spec.md §2.1).
        span_days = (history_rows[-1].created_at - history_rows[0].created_at).days
        granularity = "week" if span_days <= 70 else "month"

        def period_start(dt: datetime.datetime) -> datetime.date:
            d = dt.date()
            if granularity == "week":
                return d - datetime.timedelta(days=d.weekday())  # понедельник этой недели
            return d.replace(day=1)

        # Бары: успешные/нулевые поиски по периодам — без join, из самой search_history
        search_buckets: dict[datetime.date, dict[str, int]] = {}
        for row in history_rows:
            key = period_start(row.created_at)
            bucket = search_buckets.setdefault(key, {"successful": 0, "zero": 0})
            if row.result_count > 0:
                bucket["successful"] += 1
            else:
                bucket["zero"] += 1

        # Линия: первое появление каждой статьи пользователя (не суммарный
        # result_count — иначе повторные похожие поиски задваивали бы рост).
        # .select_from() явно — тот же класс запроса, что уже ронял get_by_id
        # (баг 2026-07-05, см. память project-broken-join-visibility-bug), здесь
        # явная защита, хотя select() уже анкорится на реальную колонку.
        first_seen_rows = (
            await self.session.execute(
                select(
                    SearchResultArticle.article_id,
                    func.min(SearchHistory.created_at).label("first_seen"),
                )
                .select_from(SearchResultArticle)
                .join(SearchHistory, SearchResultArticle.search_history_id == SearchHistory.id)
                .where(SearchHistory.user_id == user_id)
                .group_by(SearchResultArticle.article_id)
            )
        ).all()

        new_articles_by_period: dict[datetime.date, int] = {}
        for fs_row in first_seen_rows:
            key = period_start(fs_row.first_seen)
            new_articles_by_period[key] = new_articles_by_period.get(key, 0) + 1

        all_periods = sorted(set(search_buckets) | set(new_articles_by_period))

        buckets = []
        cumulative = 0
        for period in all_periods:
            cumulative += new_articles_by_period.get(period, 0)
            sb = search_buckets.get(period, {"successful": 0, "zero": 0})
            buckets.append(
                {
                    "period_start": period,
                    "successful_searches": sb["successful"],
                    "zero_result_searches": sb["zero"],
                    "cumulative_unique_articles": cumulative,
                }
            )

        return {"granularity": granularity, "buckets": buckets}
