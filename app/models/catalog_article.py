# ORM-модель для таблицы catalog_articles — статьи, добавленные автоматическим сидером
import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.models.base import Base


class CatalogArticle(Base):
    __tablename__ = "catalog_articles"

    __table_args__ = (
        # Одна статья не может дважды попасть в каталог
        UniqueConstraint("article_id", name="uq_catalog_articles_article_id"),
        # Быстрый lookup по article_id при JOIN с articles
        Index("ix_catalog_articles_article_id", "article_id"),
        # Фильтрация каталога по ключевому слову сидера
        Index("ix_catalog_articles_keyword", "keyword"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # FK → articles.id; каскадное удаление: удалили статью — удалилась запись каталога
    article_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("articles.id", ondelete="CASCADE"),
        nullable=False,
    )

    # Ключевое слово сидера, по которому статья попала в каталог
    keyword: Mapped[str] = mapped_column(String(100), nullable=False)

    # Время добавления в каталог — для аудита и TTL-логики
    seeded_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    def __repr__(self) -> str:
        return f"<CatalogArticle(article_id={self.article_id}, keyword='{self.keyword}')>"
