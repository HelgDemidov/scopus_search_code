# app/schemas/search_history_schemas.py
import datetime

from pydantic import BaseModel, ConfigDict, computed_field

from app.schemas.article_schemas import ArticleResponse


class SearchHistoryItemResponse(BaseModel):
    # Одна запись из истории поиска пользователя
    id: int
    query: str
    created_at: datetime.datetime
    result_count: int
    filters: dict

    @computed_field                          # вычисляется автоматически при сериализации
    @property
    def results_available(self) -> bool:
        return self.result_count > 0         # точно по ТЗ раздел 6

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


class SearchResultsResponse(BaseModel):
    # Ответ GET /articles/history/{search_id}/results — статьи конкретного поиска
    # Поле search_id позволяет фронту сверить, что ответ соответствует запрошенному id
    search_id: int
    query: str                          # поисковый запрос из search_history.query
    created_at: datetime.datetime       # добавлено в рамках точечных доработок после коммита cfb7b317
    articles: list[ArticleResponse]     # статьи, упорядоченные по rank (порядок выдачи Scopus)
    total: int                          # len(articles) — для удобства фронта без .length