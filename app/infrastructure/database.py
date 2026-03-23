from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import settings

# 1. Создаем асинхронный "движок" (Engine)
# Он управляет пулом соединений с базой данных
engine = create_async_engine(
    url=settings.database_url,
    echo=True,  # Показать SQL-запросы в консоли (удобная опция для отладки)
)

# 2. Создаем фабрику сессий (SessionMaker)
# Через сессию будем отправлять запросы: session.add(), session.commit()
async_session_maker = async_sessionmaker(
    bind=engine,
    expire_on_commit=False
)

# 3. Базовый класс для всех моделей
# Все классы User и Article будут наследоваться от него
class Base(DeclarativeBase):
    pass