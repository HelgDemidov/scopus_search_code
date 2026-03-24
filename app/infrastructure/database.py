from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase
from app.config import settings

# 1. Проверяем: если подключаемся к облачной БД (не localhost), требуем SSL
is_cloud_db = "supabase" in settings.database_url_str or "localhost" not in settings.database_url_str

connect_args = {}
if is_cloud_db:
    # Требуем защищенного соединения для облачных БД
    connect_args = {"ssl": "require"}

# 1. Создаем асинхронный "движок" (Engine)
# Он управляет пулом соединений с базой данных
engine = create_async_engine(
    url=settings.database_url_str, #_str добавлено для облачной реализации
    echo=True,  # Показать SQL-запросы в консоли (удобная опция для отладки)
    connect_args=connect_args # строка добавлена для облачной реализации на Supabase
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