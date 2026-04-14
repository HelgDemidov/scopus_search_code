import datetime

from sqlalchemy import DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.models.base import Base


class SeederKeyword(Base):
    __tablename__ = "seeder_keywords"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # Сама поисковая фраза — уникальна на уровне БД, дубли невозможны
    keyword: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)

    # Тематический кластер, к которому относится фраза (LLM, GAN, neuromorphic и т.д.)
    cluster: Mapped[str] = mapped_column(String(100), nullable=False)

    # Сколько новых статей было сохранено в articles по этой фразе
    articles_found: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Когда фраза была последний раз использована сидером
    used_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )

    def __repr__(self) -> str:
        return f"<SeederKeyword(keyword='{self.keyword[:40]}', cluster='{self.cluster}')>"
