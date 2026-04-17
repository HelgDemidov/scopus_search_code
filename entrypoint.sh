#!/bin/sh
# Скрипт запуска контейнера: сначала миграции, потом сервер

# Останавливаем выполнение при любой ошибке
set -e

echo "Running Alembic migrations..."
# Применяем все pending-миграции — идемпотентно, безопасно при каждом деплое
alembic upgrade head

echo "Migrations complete. Starting server..."
# Передаем управление uvicorn — exec заменяет текущий процесс,
# чтобы uvicorn получил PID 1 и корректно обрабатывал сигналы Railway
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
