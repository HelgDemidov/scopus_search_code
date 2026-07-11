import json
import logging

import httpx

from app.config import settings
from app.interfaces.nl_pivot_parser import INlPivotParser, NlPivotParseError
from app.schemas.article_schemas import ALLOWED_PIVOT_PAIRS, PivotGroundingContext

logger = logging.getLogger(__name__)

OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"

_DIMENSIONS = ("year", "country", "doc_type", "journal", "open_access")
_METRICS = ("count", "avg_citations")

# json_schema/structured_outputs (docs/ai-nl-pivot/spec.md §2) — оба кандидата-модели его
# поддерживают. Все поля nullable+required (а не anyOf двух форм) — совместимо со strict-режимом
# у большего числа провайдеров: либо заполнены row_dim/col_dim (+опционально остальное), либо
# заполнен error, а не смесь двух разных форм объекта.
_RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "row_dim": {"type": ["string", "null"], "enum": [*_DIMENSIONS, None]},
        "col_dim": {"type": ["string", "null"], "enum": [*_DIMENSIONS, None]},
        "filter_dim": {"type": ["string", "null"], "enum": [*_DIMENSIONS, None]},
        "filter_value": {"type": ["string", "null"]},
        "metric": {"type": ["string", "null"], "enum": [*_METRICS, None]},
        "error": {"type": ["string", "null"]},
    },
    "required": ["row_dim", "col_dim", "filter_dim", "filter_value", "metric", "error"],
    "additionalProperties": False,
}


def _format_allowed_pairs() -> str:
    # Сортировка — детерминированный порядок в промпте (frozenset[frozenset] не гарантирует
    # стабильный порядок итерации между процессами из-за hash randomization строк).
    pairs = sorted(tuple(sorted(pair)) for pair in ALLOWED_PIVOT_PAIRS)
    return "\n".join(f"- {a} x {b}" for a, b in pairs)


def _build_prompt(query: str, grounding: PivotGroundingContext) -> str:
    year_range = f"{min(grounding.years)}-{max(grounding.years)}" if grounding.years else "n/a"
    return (
        "You translate a natural-language analytics question into a pivot-table "
        "specification for a research-article database (Scopus-derived catalog).\n\n"
        f"Valid dimensions: {', '.join(_DIMENSIONS)}.\n"
        "Valid row_dim/col_dim pairs (row_dim and col_dim TOGETHER must form exactly one "
        f"of these unordered pairs):\n{_format_allowed_pairs()}\n\n"
        "Rules:\n"
        "- row_dim and col_dim are REQUIRED and must form one of the valid pairs above.\n"
        "- If the user's question implies only ONE dimension (e.g. 'articles per year'), "
        "pick a natural second dimension to pair it with ('year' is a safe default) "
        "instead of setting error.\n"
        "- filter_dim/filter_value are OPTIONAL — set them only when the user names a "
        "specific value to narrow down (acts as a filter, not an axis). filter_dim must "
        "differ from row_dim and col_dim; filter_value is required whenever filter_dim is set.\n"
        "- filter_dim='year' -> filter_value must be a 4-digit year string, e.g. '2023'.\n"
        "- filter_dim='open_access' -> filter_value must be exactly 'true' or 'false'.\n"
        "- metric is 'count' (default — number of articles) or 'avg_citations' (average "
        "citations per article) — choose avg_citations only if the user asks about "
        "citations/impact, not volume.\n"
        "- If the question cannot be reasonably mapped to this schema (not an analytics/"
        "pivot-table question at all), set error to a short reason and leave row_dim/"
        "col_dim/filter_dim/filter_value/metric null.\n\n"
        f"Known countries in the dataset (use this exact spelling if the user names one): "
        f"{', '.join(grounding.countries)}\n"
        f"Known document types: {', '.join(grounding.doc_types)}\n"
        f"Years present in the dataset: {year_range}\n\n"
        f'User question: "{query}"\n\n'
        "Respond with ONLY the JSON object matching the schema — no markdown, no explanations."
    )


def _parse_json_with_repair(raw_content: str) -> dict:
    try:
        return json.loads(raw_content)
    except json.JSONDecodeError:
        pass

    # Модель могла обернуть ответ в markdown code fence вопреки инструкции "ONLY JSON"
    # (наблюдалось у сидера, keyword_generator.py) — вырезаем первый {...} блок и пробуем снова.
    start = raw_content.find("{")
    end = raw_content.rfind("}")
    if start != -1 and end != -1 and end > start:
        try:
            return json.loads(raw_content[start : end + 1])
        except json.JSONDecodeError:
            pass

    raise NlPivotParseError(f"Не удалось распарсить ответ OpenRouter: {raw_content[:300]}")


class OpenRouterPivotParser(INlPivotParser):
    """LLM-парсер NL-запроса в pivot-параметры через OpenRouter (docs/ai-nl-pivot/spec.md §2).

    Structured outputs (response_format=json_schema) — основной путь у обоих кандидатов-моделей
    (§2 спеки); JSON-repair (_parse_json_with_repair) — fallback на случай отказа провайдера
    от strict-режима, зеркалит стиль db_seeder/seeder__scripts/keyword_generator.py.
    """

    async def parse(self, query: str, grounding: PivotGroundingContext) -> dict:
        headers = {
            "Authorization": f"Bearer {settings.OPENROUTER_API_KEY}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://github.com/HelgDemidov/scopus_search_code",
            "X-Title": "ScopusNlPivot",
        }
        payload = {
            "model": settings.OPENROUTER_NL_PIVOT_MODEL,
            "messages": [{"role": "user", "content": _build_prompt(query, grounding)}],
            "temperature": 0.0,  # детерминированный маппинг текста на схему, не творческая генерация
            "max_tokens": 200,  # ответ — маленький JSON-объект (docs/ai-nl-pivot/spec.md §0.4)
            "response_format": {
                "type": "json_schema",
                "json_schema": {"name": "pivot_query", "strict": True, "schema": _RESPONSE_SCHEMA},
            },
        }

        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                response = await client.post(OPENROUTER_API_URL, headers=headers, json=payload)
        except httpx.HTTPError as exc:
            raise NlPivotParseError(f"OpenRouter недоступен: {exc}") from exc

        if response.status_code != 200:
            raise NlPivotParseError(f"OpenRouter вернул {response.status_code}: {response.text[:300]}")

        raw_content = response.json()["choices"][0]["message"]["content"].strip()
        parsed = _parse_json_with_repair(raw_content)

        if parsed.get("error"):
            raise NlPivotParseError(str(parsed["error"]))

        return parsed
