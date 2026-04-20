import datetime

from pydantic import BaseModel, ConfigDict


class SearchHistoryItemResponse(BaseModel):
    # Одна запись из истории поиска пользователя
    id: int
    query: str
    created_at: datetime.datetime
    result_count: int
    filters: dict

    model_config = ConfigDict(from_attributes=True)


class SearchHistoryResponse(BaseModel):
    # Ответ GET /articles/history — список последних записей + общее кол-во
    items: list[SearchHistoryItemResponse]
    total: int


class QuotaResponse(BaseModel):
    # Ответ GET /articles/find/quota — состояние недельной квоты пользователя
    limit: int                          # максимум запросов за 7 дней (константа сервиса)
    used: int                           # использовано в текущем скользящем окне
    remaining: int                      # limit - used, не меньше 0
    reset_at: datetime.datetime | None  # oldest_in_window + 7d; None если used == 0
    window_days: int                    # длина окна в днях (7) — чтобы фронт не хардкодил
