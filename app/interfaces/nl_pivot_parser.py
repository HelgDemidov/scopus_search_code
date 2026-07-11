from abc import ABC, abstractmethod

from app.schemas.article_schemas import PivotGroundingContext


class NlPivotParseError(Exception):
    """LLM не смогла распарсить/сматчить NL-запрос в валидный pivot-запрос
    (docs/ai-nl-pivot/spec.md §2) — не-JSON ответ модели (не распарсиваемый после
    repair-попытки), HTTP-ошибка провайдера, или явный отказ модели ({"error": "..."})."""


class INlPivotParser(ABC):
    @abstractmethod
    async def parse(self, query: str, grounding: PivotGroundingContext) -> dict:
        """Возвращает сырой dict с ключами row_dim/col_dim/filter_dim/filter_value/metric.

        Whitelist-валидация значений — забота вызывающего (NlPivotQueryService,
        app/services/nl_pivot_query_service.py), не парсера: парсер отвечает только за
        «получить структурированный ответ от LLM или бросить исключение», не за бизнес-правила
        Table Builder.
        """
        ...
