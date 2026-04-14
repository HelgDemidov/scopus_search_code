import datetime

from sqlalchemy import Date, DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.models.base import Base


class Article(Base):
    __tablename__ = "articles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(500), nullable=False)  # dc:title — название статьи
    journal: Mapped[str] = mapped_column(String(500), nullable=True)  # prism:publicationName — название издания
    author: Mapped[str] = mapped_column(String(255), nullable=True)   # Может быть без автора
    date: Mapped[datetime.date] = mapped_column(Date, nullable=False)
    doi: Mapped[str] = mapped_column(String(255), unique=True, nullable=True)  # Может быть без DOI
    keyword: Mapped[str] = mapped_column(String(100), nullable=False)

    # Метка времени создания записи
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )

    def __repr__(self) -> str:
        return f"<Article(title='{self.title[:20]}...', keyword='{self.keyword}')>"
