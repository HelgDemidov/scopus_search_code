from typing import cast

from app.interfaces.nl_pivot_parser import INlPivotParser
from app.schemas.article_schemas import (
    NlPivotQueryResponse,
    PivotDimension,
    PivotGroundingContext,
    PivotMetric,
    validate_pivot_pair,
)
from app.services.catalog_service import CatalogService

_METRICS = frozenset({"count", "avg_citations"})


class NlPivotValidationError(Exception):
    """Ответ LLM не прошёл whitelist-валидацию (docs/ai-nl-pivot/spec.md §3) — невалидное
    измерение/пара/metric, либо нечисловой filter_value при filter_dim='year' и т.п."""


class NlPivotQueryService:
    """Text → валидные параметры pivot (docs/ai-nl-pivot/spec.md §3). Сам pivot НЕ
    выполняется здесь — single responsibility, фактический GET /stats/pivot дёргает
    фронт отдельно после addBuilderCard()."""

    def __init__(self, parser: INlPivotParser, catalog_service: CatalogService):
        self.parser = parser
        self.catalog_service = catalog_service

    async def resolve(self, query: str) -> NlPivotQueryResponse:
        # Grounding — та же точность, что уже питает ручной slicer Table Builder
        # (getSlicerOptions() на фронте, тот же источник StatsResponse). get_stats()
        # без фильтров — уже кэшируемый CatalogService-метод (TTL=60s), не новый запрос.
        stats = await self.catalog_service.get_stats()
        grounding = PivotGroundingContext(
            countries=[c.label for c in stats.by_country],
            doc_types=[d.label for d in stats.by_doc_type],
            years=[int(y.label) for y in stats.by_year],
        )

        parsed = await self.parser.parse(query, grounding)

        row_dim = parsed.get("row_dim")
        col_dim = parsed.get("col_dim")
        filter_dim = parsed.get("filter_dim")
        filter_value = parsed.get("filter_value")
        metric = parsed.get("metric") or "count"

        # Тип-guard'ы против непредвиденной формы ответа LLM (repair-путь §2 не
        # schema-валидирован Pydantic'ом) — до передачи в validate_pivot_pair/frozenset,
        # где нехэшируемый тип (list/dict) уронил бы запрос в непойманный TypeError.
        if not isinstance(row_dim, str) or not isinstance(col_dim, str):
            raise NlPivotValidationError("LLM не вернула строковые row_dim/col_dim")
        if filter_dim is not None and not isinstance(filter_dim, str):
            raise NlPivotValidationError("LLM вернула нестроковый filter_dim")
        if filter_value is not None and not isinstance(filter_value, str):
            raise NlPivotValidationError("LLM вернула нестроковый filter_value")
        if not isinstance(metric, str) or metric not in _METRICS:
            raise NlPivotValidationError(f"LLM вернула невалидную метрику: {metric!r}")

        # Тот же код проверки, что уже в GET /stats/pivot-роутере — не дублируется
        # (docs/ai-nl-pivot/spec.md §0-находка 3, §3).
        validation_error = validate_pivot_pair(row_dim, col_dim, filter_dim, filter_value)
        if validation_error is not None:
            raise NlPivotValidationError(validation_error)

        # filter_value типы по измерению — иначе int(filter_value) в postgres_catalog_repo.py
        # кидает непойманный ValueError на нечисловой год (найдено чтением кода, §2 спеки).
        if filter_dim == "year" and filter_value is not None and not filter_value.isdigit():
            raise NlPivotValidationError(f"Нечисловой год в filter_value: {filter_value!r}")
        if (
            filter_dim == "open_access"
            and filter_value is not None
            and filter_value.lower() not in ("true", "false")
        ):
            raise NlPivotValidationError(f"filter_value для open_access должен быть true/false: {filter_value!r}")

        return NlPivotQueryResponse(
            row_dim=cast(PivotDimension, row_dim),
            col_dim=cast(PivotDimension, col_dim),
            filter_dim=cast("PivotDimension | None", filter_dim),
            filter_value=filter_value,
            metric=cast(PivotMetric, metric),
        )
