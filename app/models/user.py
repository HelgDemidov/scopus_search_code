from datetime import datetime

from sqlalchemy import Integer, String, func  # + func
from sqlalchemy.orm import Mapped, mapped_column

from app.infrastructure.database import Base


class User(Base):
    __tablename__ = "users"  # Имя таблицы в PostgreSQL

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(50), nullable=True)
    email: Mapped[str] = mapped_column(String(254), unique=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())  
    # добавлено для отображения created_at в Swagger

    # Функция для вывода объекта при отладке: print(user)
    def __repr__(self) -> str:
        return f"<User(id={self.id}, email='{self.email}')>"