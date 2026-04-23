import asyncio
from logging.config import fileConfig

from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from alembic import context

# Объект конфигурации Alembic, дающий доступ к значениям из .ini файла
config = context.config

# Настройка логирования через конфиг-файл
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

import sys
from pathlib import Path

# Добавляем корневую папку в путь Python, чтобы Alembic увидел папку app
sys.path.append(str(Path(__file__).parent.parent))

from app.config import settings
from app.models.base import Base

# Импортируем все модели, чтобы Alembic обнаружил их через Base.metadata
from app.models.user import User  # noqa: F401
from app.models.article import Article  # noqa: F401
from app.models.seeder_keyword import SeederKeyword  # noqa: F401
from app.models.refresh_token import RefreshToken  # noqa: F401  — fix Risk 6
from app.models.search_history import SearchHistory  # noqa: F401
from app.models.catalog_article import CatalogArticle          # noqa: F401
from app.models.search_result_article import SearchResultArticle  # noqa: F401

# Передаем метаданные всех зарегистрированных моделей
target_metadata = Base.metadata

# Подставляем URL базы данных из .env — экранируем % для configparser
alembic_url = settings.database_url_str.replace("%", "%%")
config.set_main_option("sqlalchemy.url", alembic_url)


def run_migrations_offline() -> None:
    """Запуск миграций в offline-режиме (без реального соединения с БД)."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata)

    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    # Создаем асинхронный движок и прогоняем миграции через него
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


def run_migrations_online() -> None:
    # Запуск миграций в online-режиме (стандартный путь)
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
