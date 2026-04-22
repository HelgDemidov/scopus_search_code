import datetime

from sqlalchemy import Boolean, Date, DateTime, Index, Integer, String, Text
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
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(500), nullable=False)                    # dc:title — название статьи
    journal: Mapped[str] = mapped_column(String(500), nullable=True)                   # prism:publicationName — журнал
    author: Mapped[str] = mapped_column(String(255), nullable=True)                    # dc:creator — первый автор
    publication_date: Mapped[datetime.date] = mapped_column(Date, nullable=False)      # prism:coverDate
    doi: Mapped[str] = mapped_column(String(255), nullable=True)                       # prism:doi — unique=True перенесен в __table_args__

    # keyword — технический ярлык сидера; nullable=True начиная с миграции 0006
    # (scopus_client больше не передает keyword при пользовательском поиске).
    # Колонка физически удаляется в миграции 0007 (Фаза 3).
    keyword: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Расширенные наукометрические поля (доступны в Scopus free-tier)
    cited_by_count: Mapped[int] = mapped_column(Integer, nullable=True)                # citedby-count — число цитирований
    document_type: Mapped[str] = mapped_column(String(100), nullable=True)             # subtypeDescription — тип документа
    open_access: Mapped[bool] = mapped_column(Boolean, nullable=True)                  # openaccess — флаг открытого доступа
    affiliation_country: Mapped[str] = mapped_column(String(100), nullable=True)       # affiliation[0].affiliation-country

    # is_seeded — флаг сидера; nullable=False сохраняется до миграции 0007 (Фаза 3),
    # когда колонка удаляется вместе с keyword.
    is_seeded: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default="false"
    )

    # Метка времени создания записи
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )

    def __repr__(self) -> str:
        return f"<Article(title='{self.title[:20]}...')>"
