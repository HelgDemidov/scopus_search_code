# ORM-модель для таблицы search_result_articles — статьи из пользовательских поисков
from sqlalchemy import ForeignKey, Index, Integer, SmallInteger, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class SearchResultArticle(Base):
    __tablename__ = "search_result_articles"

    __table_args__ = (
        # Одна статья не может дважды быть результатом одного поиска
        UniqueConstraint("search_history_id", "article_id", name="uq_sra_history_article"),
        # Быстрый lookup результатов конкретного поиска
        Index("ix_sra_search_history_id", "search_history_id"),
        # Индекс по article_id намеренно отсутствует: обратный поиск (какие поиски
        # дали эту статью) — нечастая операция, не оправдывает накладные расходы на индекс
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # FK → search_history.id; каскад: удалили запись истории — удалились её результаты
    search_history_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("search_history.id", ondelete="CASCADE"),
        nullable=False,
    )

    # FK → articles.id; RESTRICT: нельзя удалить статью, если на неё есть результаты поиска
    article_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("articles.id", ondelete="RESTRICT"),
        nullable=False,
    )

    # Порядковый номер статьи в выдаче Scopus (0-based или 1-based — определяет сервис)
    rank: Mapped[int] = mapped_column(SmallInteger, nullable=False)

    def __repr__(self) -> str:
        return f"<SearchResultArticle(search_history_id={self.search_history_id}, article_id={self.article_id}, rank={self.rank})>"
