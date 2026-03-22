import datetime
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, Integer, Date, DateTime
from sqlalchemy.sql import func
from app.infrastructure.database import Base

class Article(Base):
    __tablename__ = "articles"  

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    author: Mapped[str] = mapped_column(String(255), nullable=True) # Может быть без автора
    date: Mapped[datetime.date] = mapped_column(Date, nullable=False)
    doi: Mapped[str] = mapped_column(String(255), unique=True, nullable=True) # Может быть без DOI
    keyword: Mapped[str] = mapped_column(String(100), nullable=False)

    # Как писать DEFAULT now():
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), 
        server_default=func.now(), 
        nullable=False
    )

    # Функция для вывода объекта при отладке
    def __repr__(self) -> str:
        return f"<Article(title='{self.title[:20]}...', keyword='{self.keyword}')>"
