# Базовый образ: официальный Python 3.12, минимальная версия (slim)
FROM python:3.12-slim

# Устанавливаем рабочую директорию внутри контейнера
WORKDIR /app_code

# Сначала копируем только requirements.txt и устанавливаем зависимости.
# Docker кэширует этот слой — если requirements.txt не менялся,
# повторная сборка не будет заново скачивать все библиотеки.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Теперь копируем весь код проекта внутрь контейнера
COPY . .

# Говорим контейнеру, какую команду запускать при старте
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]