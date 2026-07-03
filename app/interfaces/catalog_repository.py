# Интерфейс репозитория каталога — статьи, добавленные автоматическим сидером
from abc import ABC, abstractmethod
from typing import List

from app.models.article import Article
from app.schemas.article_schemas import PivotDimension


class ICatalogRepository(ABC):
    @abstractmethod
    async def get_all(
        self,
        limit: int,
        offset: int,
        keyword: str | None = None,
        search: str | None = None,
        year_from: int | None = None,
        year_to: int | None = None,
        doc_types: list[str] | None = None,
        open_access: bool | None = None,
        countries: list[str] | None = None,
    ) -> List[Article]:
        """
        Возвращает статьи каталога с пагинацией и опциональными фильтрами.
        keyword:     точное совпадение с ключевым словом сидера; None — без фильтра.
        search:      ILIKE-поиск по title и author; None — без fulltext-фильтра.
        year_from:   год публикации >= year_from; None — без нижней границы.
        year_to:     год публикации <= year_to; None — без верхней границы.
        doc_types:   фильтр по типу документа (Article, Review и т.д.); None — все типы.
        open_access: True — только OA; False — только не-OA; None — все.
        countries:   фильтр по стране аффилиации (один или несколько); None — все страны.
        """
        pass

    @abstractmethod
    async def get_total_count(
        self,
        keyword: str | None = None,
        search: str | None = None,
        year_from: int | None = None,
        year_to: int | None = None,
        doc_types: list[str] | None = None,
        open_access: bool | None = None,
        countries: list[str] | None = None,
    ) -> int:
        """
        Считает статьи каталога с теми же фильтрами, что get_all — для корректной пагинации.
        """
        pass

    @abstractmethod
    async def save_seeded(
        self,
        articles: List[Article],
        keyword: str,
    ) -> List[Article]:
        """
        Сохраняет пачку статей сидера: upsert в articles + запись в catalog_articles.
        Возвращает статьи с заполненными id из БД.
        Не вызывает commit() — управление транзакцией на стороне вызывающего кода.
        """
        pass

    @abstractmethod
    async def get_stats(
        self,
        countries: list[str] | None = None,
        doc_types: list[str] | None = None,
        open_access: bool | None = None,
        year_from: int | None = None,
        year_to: int | None = None,
    ) -> dict:
        """
        Возвращает агрегированную статистику по каталогу с опциональными фильтрами.
        Без фильтров — полная статистика (эквивалент V1).
        Поля ответа: total_articles, total_journals, total_countries, total_authors,
        open_access_count, by_year, by_journal, by_country, by_doc_type, top_keywords, top_authors,
        by_year_top_countries, sunburst_country_open_access, top_journals_by_country
        (кросс-агрегаты для стационарных графиков /explore, docs/explore-cross-analytics/spec.md §2).
        """
        pass

    @abstractmethod
    async def get_journal_impact(self, max_year: int) -> list[dict]:
        """
        Топ-N журналов по объёму (count) + среднее/медианное цитирование среди статей,
        опубликованных <= max_year — для Journal Landscape Scatter (интерактивный слайдер
        окна зрелости, docs/explore-table-builder/spec.md §1). Журналы с count < 20
        не включаются (статистически шумная выборка).
        Возвращает [{"journal": str, "count": int, "mean_citations": float,
        "median_citations": float}, ...], отсортировано по count DESC.
        """
        pass

    @abstractmethod
    async def get_pivot(
        self,
        row_dim: PivotDimension,
        col_dim: PivotDimension,
        top_n_rows: int,
        top_n_cols: int,
        filter_dim: PivotDimension | None = None,
        filter_value: str | None = None,
    ) -> dict:
        """
        2D pivot (Table Builder, docs/explore-table-builder/spec.md §3) по 2 whitelisted
        измерениям (row_dim/col_dim из PivotDimension — валидация типа уже на уровне FastAPI).
        top_n_rows/top_n_cols — обрезка по маржинальному объёму (не по всему множеству
        значений измерения — journal/country высококардинальны).
        filter_dim/filter_value — опциональный slicer (3-е измерение как фильтр WHERE,
        не как ось), не участвует в group by.
        Возвращает dict с ключами row_labels, col_labels, matrix, row_totals, col_totals
        (см. PivotResponse).
        """
        pass
