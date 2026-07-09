import datetime

from sqlalchemy import Boolean, Date, DateTime, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func, text

from app.models.base import Base


class Article(Base):
    __tablename__ = "articles"

    # Partial unique index по doi: NULL-строки не участвуют в конфликте,
    # ON CONFLICT (doi) DO UPDATE корректно находит этот индекс (в отличие
    # от UniqueConstraint, который PostgreSQL не принимает в index_elements).
    __table_args__ = (
        Index(
            "ix_articles_doi_unique",
            "doi",
            unique=True,
            postgresql_where=text("doi IS NOT NULL"),
        ),
        # Индексы для серверной фильтрации каталога (migration 0008)
        Index("ix_articles_document_type", "document_type"),
        Index("ix_articles_affiliation_country", "affiliation_country"),
        # Диапазонный year-фильтр (migration 0017) — под sargable-предикат
        # publication_date < make_date(max_year+1,1,1) в get_journal_impact()
        Index("ix_articles_publication_date", "publication_date"),
        Index(
            "ix_articles_open_access_true",
            "open_access",
            postgresql_where=text("open_access = true"),
        ),
        # Partial unique index для upsert статей без DOI (migration 0006)
        Index(
            "ix_articles_no_doi_unique",
            "title",
            "publication_date",
            "author",
            unique=True,
            postgresql_where=text("doi IS NULL"),
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(500), nullable=False)  # dc:title — название статьи
    journal: Mapped[str] = mapped_column(
        String(500), nullable=True
    )  # prism:publicationName — журнал  # noqa: E501
    author: Mapped[str] = mapped_column(String(255), nullable=True)  # dc:creator — первый автор
    publication_date: Mapped[datetime.date] = mapped_column(Date, nullable=False)  # prism:coverDate
    doi: Mapped[str] = mapped_column(
        String(255), nullable=True
    )  # prism:doi — unique=True перенесен в __table_args__  # noqa: E501

    # Расширенные наукометрические поля (доступны в Scopus free-tier)
    cited_by_count: Mapped[int] = mapped_column(
        Integer, nullable=True
    )  # citedby-count — число цитирований  # noqa: E501
    document_type: Mapped[str] = mapped_column(
        String(100), nullable=True
    )  # subtypeDescription — тип документа  # noqa: E501
    open_access: Mapped[bool] = mapped_column(
        Boolean, nullable=True
    )  # openaccess — флаг открытого доступа  # noqa: E501
    affiliation_country: Mapped[str] = mapped_column(
        String(100), nullable=True
    )  # affiliation[0].affiliation-country  # noqa: E501

    # Метка времени создания записи
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    def __repr__(self) -> str:
        return f"<Article(title='{self.title[:20]}...')>"
