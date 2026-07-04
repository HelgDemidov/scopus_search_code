from datetime import date
from typing import List, Literal

from pydantic import BaseModel

# Whitelist измерений Table Builder (docs/explore-table-builder/spec.md §3.1) — Literal
# даёт FastAPI/Pydantic автоматическую 422-валидацию на уровне запроса, до того как
# строка попадёт в SQL-запрос репозитория (защита от инъекции через "произвольное" имя колонки).
PivotDimension = Literal["year", "country", "doc_type", "journal", "open_access"]


class ArticleResponse(BaseModel):
    # Схема одной статьи — только поля, реально доступные в Scopus free-tier API
    # keyword убран: он принадлежит catalog_articles, а не articles
    id: int  # первичный ключ — нужен для маршрута /article/:id на фронтенде
    title: str  # Название статьи (dc:title)
    journal: str | None  # Название издания (prism:publicationName)
    author: str | None  # Первый автор (dc:creator)
    publication_date: date  # Дата публикации (prism:coverDate)
    doi: str | None  # DOI
    cited_by_count: int | None  # Число цитирований (citedby-count)
    document_type: str | None  # Тип документа (subtypeDescription)
    open_access: bool | None  # Open Access флаг (openaccess)
    affiliation_country: str | None  # Страна первого автора (affiliation[0])

    model_config = {"from_attributes": True}


class PaginatedArticleResponse(BaseModel):
    # Схема ответа для пагинации согласно ТЗ
    items: List[ArticleResponse]  # переименовано: согласовано с test_catalog_filters_e2e.py
    total: int


class CountByField(BaseModel):
    # Универсальная схема для агрегатов вида {label, count}
    label: str
    count: int


class YearCountryCount(BaseModel):
    # Кросс-агрегат для графика Top Countries by Year (docs/explore-cross-analytics/spec.md §4)
    year: int
    country: str
    count: int


class SunburstSegment(BaseModel):
    # Сегмент 2-уровневого sunburst Country → OpenAccess (spec.md §5, упрощено
    # с 3 до 2 уровней по итогам визуального ревью — doc_type как промежуточный
    # слой убран: третий слой был визуально нечитаем).
    country: str
    open_access: bool
    count: int


class JournalCountryCount(BaseModel):
    # Кросс-агрегат для графика Top Journals × Country (spec.md §6).
    # country — один из топ-5 (тот же набор, что в SunburstSegment) + "Other".
    journal: str
    country: str
    count: int


class JournalImpactPoint(BaseModel):
    # Точка Journal Landscape Scatter (docs/explore-table-builder/spec.md §1).
    # Считается по статьям, опубликованным <= max_year (интерактивный слайдер
    # окна зрелости), только для журналов с count >= 20 (см. postgres_catalog_repo).
    journal: str
    count: int
    mean_citations: float
    median_citations: float


class PivotResponse(BaseModel):
    # Ответ Table Builder — 2D pivot по 2 из 5 whitelisted измерений, опционально
    # суженный slicer'ом (3-е измерение как фильтр, не ось — docs/explore-table-builder/spec.md §3).
    row_dim: PivotDimension
    col_dim: PivotDimension
    row_labels: List[str]
    col_labels: List[str]
    matrix: List[List[int]]  # counts, matrix[i][j] = row_labels[i] x col_labels[j]
    row_totals: List[int]  # маржинальные суммы ДО обрезки top_n_cols (не сумма видимых ячеек)
    col_totals: List[int]  # маржинальные суммы ДО обрезки top_n_rows


class StatsResponse(BaseModel):
    # Схема публичного эндпоинта GET /articles/stats
    # Возвращает агрегированную статистику по статьям каталога (catalog_articles)
    total_articles: int
    total_journals: int
    total_countries: int
    total_authors: int
    open_access_count: int
    by_year: List[CountByField]  # Распределение публикаций по годам
    by_journal: List[CountByField]  # Топ-20 журналов по числу статей
    by_country: List[CountByField]  # Топ-20 стран по числу статей
    by_doc_type: List[CountByField]  # Распределение по типу документа
    top_keywords: List[CountByField]  # Топ ключевых слов сидера (legacy)
    top_authors: List[CountByField]  # Топ-20 авторов по числу статей
    # Кросс-агрегаты для стационарных графиков /explore (explore-cross-analytics)
    by_year_top_countries: List[YearCountryCount]  # Топ-10 стран × год
    sunburst_country_open_access: List[SunburstSegment]  # Топ-5 стран × Open Access
    top_journals_by_country: List[JournalCountryCount]  # Топ-10 журналов × топ-5 стран


class SearchStatsResponse(BaseModel):
    # Схема GET /articles/search/stats и GET /articles/stats/personal —
    # агрегаты по результатам пользовательского поиска
    # Данные из search_result_articles JOIN search_history WHERE user_id
    total: int  # Всего уникальных статей в поисках пользователя
    by_year: List[CountByField]  # Распределение по годам публикации
    by_journal: List[CountByField]  # Топ-20 журналов
    by_country: List[CountByField]  # Топ-20 стран аффилиации
    by_doc_type: List[CountByField]  # Распределение по типу документа
    # label: "true"/"false" (та же конвенция, что PivotDimension="open_access" в pivot,
    # см. postgres_catalog_repo._stringify_dim) — docs/personal-search-data/spec.md §2.1
    by_open_access: List[CountByField]
