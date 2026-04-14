from datetime import date
from typing import List, Optional

import httpx

from app.config import settings
from app.models.article import Article
from app.interfaces.search_client import ISearchClient

# Базовый URL Scopus Search API
SCOPUS_BASE_URL = "https://api.elsevier.com/content/search/scopus"

# Все запрашиваемые поля Scopus Search API (COMPLETE view, лимит 25 результатов за запрос):
# dc:title              — название статьи
# prism:publicationName — название журнала
# dc:creator            — первый автор
# prism:coverDate       — дата публикации
# prism:doi             — DOI статьи
# citedby-count         — число цитирований
# subtypeDescription    — тип документа (Article, Review, Conference Paper...)
# openaccess            — флаг открытого доступа (0 или 1)
# authkeywords          — ключевые слова авторов
# affiliation           — вложенный объект с организацией и страной автора
# fund-sponsor          — спонсор финансирования
# dc:description        — аннотация
SCOPUS_FIELDS = (
    "dc:title,prism:publicationName,dc:creator,prism:coverDate,prism:doi,"
    "citedby-count,subtypeDescription,openaccess,authkeywords,"
    "affiliation,fund-sponsor,dc:description"
)


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

        # Сохраняем лимиты из заголовков ответа
        self.last_rate_limit = response.headers.get("X-RateLimit-Limit")
        self.last_rate_remaining = response.headers.get("X-RateLimit-Remaining")
        self.last_rate_reset = response.headers.get("X-RateLimit-Reset")

        response.raise_for_status()

        data = response.json()
        search_results = data.get("search-results", {})
        entries = search_results.get("entry", []) or []

        articles: List[Article] = []

        for entry in entries:
            # Простые поля — единая строка в JSON
            title = entry.get("dc:title") or ""
            journal = entry.get("prism:publicationName")
            creator = entry.get("dc:creator")
            cover_date_str = entry.get("prism:coverDate")
            doi = entry.get("prism:doi")
            document_type = entry.get("subtypeDescription")
            fund_sponsor = entry.get("fund-sponsor")
            abstract = entry.get("dc:description")
            author_keywords = entry.get("authkeywords")

            # citedby-count приходит как строка, преобразуем в целое число
            cited_by_raw = entry.get("citedby-count")
            cited_by_count = int(cited_by_raw) if cited_by_raw is not None else None

            # openaccess приходит как "0" или "1", преобразуем в bool
            open_access_raw = entry.get("openaccess")
            open_access = bool(int(open_access_raw)) if open_access_raw is not None else None

            # affiliation — вложенный объект, может быть списком или словарем
            affiliation_raw = entry.get("affiliation")
            affiliation_country = None
            if isinstance(affiliation_raw, list) and affiliation_raw:
                affiliation_country = affiliation_raw[0].get("affiliation-country")
            elif isinstance(affiliation_raw, dict):
                affiliation_country = affiliation_raw.get("affiliation-country")

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
                publication_date=cover_date,
                doi=doi[:255] if doi else None,
                keyword=keyword[:100],
                cited_by_count=cited_by_count,
                document_type=document_type[:100] if document_type else None,
                open_access=open_access,
                author_keywords=author_keywords,
                affiliation_country=affiliation_country[:100] if affiliation_country else None,
                fund_sponsor=fund_sponsor[:255] if fund_sponsor else None,
                abstract=abstract,
            )
            articles.append(article)

        return articles
