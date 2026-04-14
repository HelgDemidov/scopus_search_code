from datetime import date
from typing import List, Optional

import httpx

from app.config import settings
from app.models.article import Article
from app.interfaces.search_client import ISearchClient

# Базовый URL Scopus Search API (актуальный endpoint)
SCOPUS_BASE_URL = "https://api.elsevier.com/content/search/scopus"

# Поля ответа Scopus API:
# dc:title              — название статьи
# prism:publicationName — название журнала/издания
SCOPUS_FIELDS = "dc:title,prism:publicationName,dc:creator,prism:coverDate,prism:doi"


class ScopusHTTPClient(ISearchClient):
    # Принимаем готовый httpx.AsyncClient снаружи (Dependency Injection)
    # Клиент создается один раз при старте приложения (в Lifespan) и живет всегда
    def __init__(self, http_client: httpx.AsyncClient):
        self._client = http_client
        self.last_rate_limit: Optional[str] = None
        self.last_rate_remaining: Optional[str] = None
        self.last_rate_reset: Optional[str] = None

    async def search(self, keyword: str, count: int = 25) -> List[Article]:
        page_size = min(count, 25)

        params = {
            "query": f"TITLE-ABS-KEY({keyword})",
            "count": page_size,
            "field": SCOPUS_FIELDS,
            "apiKey": settings.SCOPUS_API_KEY,
        }

        response = await self._client.get(SCOPUS_BASE_URL, params=params)

        # Сохраняем лимиты из заголовков
        self.last_rate_limit = response.headers.get("X-RateLimit-Limit")
        self.last_rate_remaining = response.headers.get("X-RateLimit-Remaining")
        self.last_rate_reset = response.headers.get("X-RateLimit-Reset")

        response.raise_for_status()

        data = response.json()
        search_results = data.get("search-results", {})
        entries = search_results.get("entry", []) or []

        articles: List[Article] = []

        for entry in entries:
            title = entry.get("dc:title") or ""               # название самой статьи
            journal = entry.get("prism:publicationName")       # название журнала/издания
            creator = entry.get("dc:creator")
            cover_date_str = entry.get("prism:coverDate")
            doi = entry.get("prism:doi")

            if not cover_date_str:
                continue

            try:
                cover_date = date.fromisoformat(cover_date_str)
            except ValueError:
                continue

            article = Article(
                title=title[:500],
                journal=journal[:500] if journal else None,
                author=creator[:255] if creator else None,
                date=cover_date,
                doi=doi[:255] if doi else None,
                keyword=keyword[:100],
            )
            articles.append(article)

        return articles
