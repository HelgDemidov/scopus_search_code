from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from app.config import settings

# 1. Проверяем: если подключаемся к облачной БД (не localhost), требуем SSL
is_cloud_db = "supabase" in settings.database_url_str or "localhost" not in settings.database_url_str

connect_args = {}
if is_cloud_db:
    # Требуем защищенного соединения для облачных БД
    connect_args = {"ssl": "require"}

# 1. Создаем асинхронный "движок" (Engine)
# Он управляет пулом соединений с базой данных
print(f"[database] Creating async database engine (cloud_db={is_cloud_db})", flush=True)
engine = create_async_engine(
    url=settings.database_url_str, #_str добавлено для облачной реализации
    echo=False,  # SQL-запросы в консоли отключены (включить echo=True для локальной отладки)
    connect_args=connect_args # строка добавлена для облачной реализации на Supabase
)
print("[database] Async database engine created successfully", flush=True)

# 2. Создаем фабрику сессий (SessionMaker)
# Через сессию будем отправлять запросы: session.add(), session.commit()
print("[database] Creating async session maker...", flush=True)
async_session_maker = async_sessionmaker(
    bind=engine,
    expire_on_commit=False
)
print("[database] Async session maker configured", flush=True)
