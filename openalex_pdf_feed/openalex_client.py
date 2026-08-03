# openalex_pdf_feed/openalex_client.py
"""Клиент OpenAlex API: discovery по точным фразам + content-download.

Факты о REST-контракте проверены live 2026-08-03 (см. docs/side-projects/openalex-pdf-feed/spec.md):
- discovery: GET https://api.openalex.org/works?filter=...
- content-download: GET https://content.openalex.org/works/{id}.pdf?api_key=...
  (отдельный поддомен content.openalex.org, НЕ api.openalex.org)
- бюджет — заголовок x-ratelimit-remaining-usd на каждом ответе; отдельного
  /status эндпоинта не существует (это была неточность черновика спеки).
"""

from collections.abc import AsyncIterator
from datetime import date

import httpx

API_BASE_URL = "https://api.openalex.org/works"
CONTENT_BASE_URL = "https://content.openalex.org/works"
PER_PAGE = 100  # максимум, разрешённый OpenAlex (per_page max: 100)


class OpenAlexError(Exception):
    pass


def build_filter(term: str, since: date | None) -> str:
    """Собирает filter-строку для discovery.

    Кавычки вокруг фразы обязательны: без них title_and_abstract.search
    делает нестрогий стемминг-матч и даёт кратное шумовое раздутие —
    проверено live: "existential analysis" без кавычек = 18271 результат,
    с кавычками = 433. has_content.pdf:true — чтобы не тратить платный
    content-download на работы без кэша.
    """
    parts = [
        "open_access.is_oa:true",
        "has_content.pdf:true",
        f'title_and_abstract.search:"{term}"',
    ]
    if since is not None:
        parts.append(f"from_publication_date:{since.isoformat()}")
    return ",".join(parts)


def work_short_id(work: dict) -> str:
    # 'https://openalex.org/W2741809807' -> 'W2741809807'
    return work["id"].rsplit("/", 1)[-1]


class OpenAlexClient:
    # Принимаем готовый httpx.AsyncClient снаружи (DI) — по образцу ScopusHTTPClient.
    def __init__(self, http_client: httpx.AsyncClient, api_key: str):
        self._client = http_client
        self._api_key = api_key
        self._last_remaining_usd: float | None = None

    @property
    def last_remaining_usd(self) -> float | None:
        return self._last_remaining_usd

    def has_budget(self, min_usd: float) -> bool:
        # Пока не было ни одного вызова — бюджет неизвестен, разрешаем начать
        # (первый вызов сам заполнит last_remaining_usd из заголовка ответа).
        if self._last_remaining_usd is None:
            return True
        return self._last_remaining_usd >= min_usd

    def _record_budget(self, response: httpx.Response) -> None:
        raw = response.headers.get("x-ratelimit-remaining-usd")
        if raw is None:
            return
        try:
            self._last_remaining_usd = float(raw)
        except ValueError:
            pass

    async def discover(self, term: str, since: date | None = None) -> AsyncIterator[dict]:
        """Итерирует OA-работы по точной фразе через cursor-пагинацию."""
        cursor: str | None = "*"
        filter_str = build_filter(term, since)
        while cursor is not None:
            response = await self._client.get(
                API_BASE_URL,
                params={
                    "filter": filter_str,
                    "per-page": PER_PAGE,
                    "cursor": cursor,
                    "api_key": self._api_key,
                },
            )
            self._record_budget(response)
            if response.status_code != 200:
                raise OpenAlexError(f"discovery '{term}' → {response.status_code}: {response.text[:200]}")
            data = response.json()
            for work in data.get("results", []):
                yield work
            cursor = data.get("meta", {}).get("next_cursor")

    async def download_content(self, openalex_id: str) -> bytes:
        """Скачивает закэшированный PDF ($0.01/вызов, см. build_filter про
        has_content.pdf:true в discovery — сюда должны попадать только id
        работ, уже прошедших этот фильтр)."""
        response = await self._client.get(
            f"{CONTENT_BASE_URL}/{openalex_id}.pdf",
            params={"api_key": self._api_key},
        )
        self._record_budget(response)
        if response.status_code != 200:
            raise OpenAlexError(f"content-download {openalex_id} → {response.status_code}: {response.text[:200]}")
        return response.content
