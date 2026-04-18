from datetime import date
from typing import List

from pydantic import BaseModel


class ArticleResponse(BaseModel):
    # Схема одной статьи — только поля, реально доступные в Scopus free-tier API
    id: int                          # первичный ключ — нужен для маршрута /article/:id на фронтенде
    title: str                       # Название статьи (dc:title)
    journal: str | None              # Название издания (prism:publicationName)
    author: str | None               # Первый автор (dc:creator)
    publication_date: date           # Дата публикации (prism:coverDate)
    doi: str | None                  # DOI
    keyword: str                     # Поисковый запрос сидера
    cited_by_count: int | None       # Число цитирований (citedby-count)
    document_type: str | None        # Тип документа (subtypeDescription)
    open_access: bool | None         # Open Access флаг (openaccess)
    affiliation_country: str | None  # Страна первого автора (affiliation[0])

    model_config = {"from_attributes": True}


class PaginatedArticleResponse(BaseModel):
    # Схема ответа для пагинации согласно ТЗ
    articles: List[ArticleResponse]
    total: int


class CountByField(BaseModel):
    # Универсальная схема для агрегатов вида {label, count}
    label: str
    count: int


class StatsResponse(BaseModel):
    # Схема публичного эндпоинта GET /articles/stats
    # Возвращает агрегированную статистику только по сидированным статьям (is_seeded=True)
    total_articles: int
    total_journals: int
    total_countries: int
    open_access_count: int
    by_year: List[CountByField]      # Распределение публикаций по годам
    by_journal: List[CountByField]   # Топ-10 журналов по числу статей
    by_country: List[CountByField]   # Топ-10 стран по числу статей
    by_doc_type: List[CountByField]  # Распределение по типу документа
    top_keywords: List[CountByField] # Топ ключевых слов сидера
