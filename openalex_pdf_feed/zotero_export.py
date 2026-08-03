# openalex_pdf_feed/zotero_export.py
"""Маппинг OpenAlex work JSON -> CSL-JSON для импорта в Zotero.

Zotero принимает CSL-JSON как единый файл-массив (File -> Import). Здесь —
только генерация файла (см. спеку §6); автоматический импорт через Zotero
local API — вне скоупа.
"""

from typing import Any

from openalex_pdf_feed.openalex_client import work_short_id

# OpenAlex type -> CSL type. Не покрывает всю таксономию OpenAlex — сознательно:
# подавляющее большинство результатов discovery (§1 спеки) это журнальные
# статьи, для них DEFAULT_CSL_TYPE и так корректен.
CSL_TYPE_MAP = {
    "article": "article-journal",
    "review": "review",
    "book": "book",
    "book-chapter": "chapter",
    "dissertation": "thesis",
    "preprint": "article",
    "report": "report",
}
DEFAULT_CSL_TYPE = "article-journal"


def _split_author_name(display_name: str) -> dict[str, str]:
    # CSL-JSON ожидает family/given; OpenAlex отдаёт только цельное display_name.
    # Эвристика: последнее слово — family, остальное — given. Однословные
    # имена (организации и т.п.) кладём в literal, не гадаем split.
    parts = display_name.split()
    if len(parts) < 2:
        return {"literal": display_name}
    return {"family": parts[-1], "given": " ".join(parts[:-1])}


def _strip_doi_prefix(doi: str | None) -> str | None:
    if doi is None:
        return None
    return doi.removeprefix("https://doi.org/")


def work_to_csl_json(work: dict) -> dict[str, Any]:
    """Конвертирует один work-объект OpenAlex (тот же JSON, что лежит в
    papers/<id>.json) в один CSL-JSON item."""
    csl_type = CSL_TYPE_MAP.get(work.get("type", ""), DEFAULT_CSL_TYPE)

    authors = [
        _split_author_name(a["author"]["display_name"])
        for a in work.get("authorships", [])
        if a.get("author", {}).get("display_name")
    ]

    source = (work.get("primary_location") or {}).get("source") or {}
    container_title = source.get("display_name")

    item: dict[str, Any] = {
        "id": work_short_id(work),
        "type": csl_type,
        "title": work.get("title") or work.get("display_name"),
    }
    if authors:
        item["author"] = authors
    if work.get("publication_year"):
        item["issued"] = {"date-parts": [[work["publication_year"]]]}
    if container_title:
        item["container-title"] = container_title
    doi = _strip_doi_prefix(work.get("doi"))
    if doi:
        item["DOI"] = doi
    if work.get("id"):
        item["URL"] = work["id"]  # канонический OpenAlex work URL

    return item


def build_library(works: list[dict]) -> list[dict[str, Any]]:
    """Полная пересборка zotero/library.json из всех сохранённых метаданных
    (папка papers/*.json) — не инкрементально, см. спеку §6."""
    return [work_to_csl_json(w) for w in works]
