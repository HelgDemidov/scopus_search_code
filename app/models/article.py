import datetime

from sqlalchemy import Boolean, Date, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.models.base import Base


class Article(Base):
    __tablename__ = "articles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(500), nullable=False)           # dc:title — название статьи
    journal: Mapped[str] = mapped_column(String(500), nullable=True)           # prism:publicationName — название издания
    author: Mapped[str] = mapped_column(String(255), nullable=True)            # dc:creator — первый автор
    publication_date: Mapped[datetime.date] = mapped_column(Date, nullable=False)  # prism:coverDate
    doi: Mapped[str] = mapped_column(String(255), unique=True, nullable=True)  # prism:doi
    keyword: Mapped[str] = mapped_column(String(100), nullable=False)          # поисковый запрос сидера

    # Расширенные наукометрические поля
    cited_by_count: Mapped[int] = mapped_column(Integer, nullable=True)        # citedby-count — число цитирований
    document_type: Mapped[str] = mapped_column(String(100), nullable=True)     # subtypeDescription — тип документа
    open_access: Mapped[bool] = mapped_column(Boolean, nullable=True)          # openaccess — флаг открытого доступа
    author_keywords: Mapped[str] = mapped_column(Text, nullable=True)          # authkeywords — ключевые слова авторов
    affiliation_country: Mapped[str] = mapped_column(String(100), nullable=True)  # affiliation[0].affiliation-country
    fund_sponsor: Mapped[str] = mapped_column(String(255), nullable=True)      # fund-sponsor — спонсор финансирования
    abstract: Mapped[str] = mapped_column(Text, nullable=True)                 # dc:description — аннотация статьи

    # Метка времени создания записи
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )

    def __repr__(self) -> str:
        return f"<Article(title='{self.title[:20]}...', keyword='{self.keyword}')>"
