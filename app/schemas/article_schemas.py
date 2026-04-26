from datetime import date
from typing import List

from pydantic import BaseModel


class ArticleResponse(BaseModel):
    # Схема одной статьи — только поля, реально доступные в Scopus free-tier API
    # keyword убран: он принадлежит catalog_articles, а не articles
    id: int                          # первичный ключ — нужен для маршрута /articles/:id на фронтенде
    title: str                       # Название статьи (dc:title)
    journal: str | None              # Название издания (prism:publicationName)
    author: str | None               # Первый автор (dc:creator)
    publication_date: date           # Дата публикации (prism:coverDate)
    doi: str | None                  # DOI
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
    # Возвращает агрегированную статистику по статьям каталога (catalog_articles)
    total_articles: int
    total_journals: int
    total_countries: int
    open_access_count: int
    by_year: List[CountByField]      # Распределение публикаций по годам
    by_journal: List[CountByField]   # Топ-20 журналов по числу статей
    by_country: List[CountByField]   # Топ-20 стран по числу статей
    by_doc_type: List[CountByField]  # Распределение по типу документа
    top_keywords: List[CountByField] # Топ ключевых слов сидера


class SearchStatsResponse(BaseModel):
    # Схема GET /articles/search/stats — агрегаты по результатам пользовательского поиска
    # Данные из search_result_articles JOIN search_history WHERE user_id
    # Клиент — Tremor-дашборд авторизованного пользователя
    total: int                           # Всего уникальных статей в поисках пользователя
    by_year: List[CountByField]          # Распределение по годам публикации
    by_journal: List[CountByField]       # Топ-20 журналов
    by_country: List[CountByField]       # Топ-20 стран аффилиации
    by_doc_type: List[CountByField]      # Распределение по типу документа
