import datetime

from sqlalchemy import DateTime, Integer
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class SeederRunState(Base):
    """Счётчик прогонов сидера — единственная строка (id=1).

    Используется POST /seeder/vacuum: раз в N прогонов инициирует VACUUM ANALYZE
    articles, чтобы GIN pending list (pg_trgm, см. docs/backend-performance/
    catalog-search-latency/spec.md) не успевал деградировать чтение между
    срабатываниями autovacuum_vacuum_insert_threshold (~13 дней при историческом
    темпе прироста — слишком редко).
    """

    __tablename__ = "seeder_run_state"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    run_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    last_vacuum_at: Mapped[datetime.datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    def __repr__(self) -> str:
        return f"<SeederRunState(run_count={self.run_count}, last_vacuum_at={self.last_vacuum_at})>"
