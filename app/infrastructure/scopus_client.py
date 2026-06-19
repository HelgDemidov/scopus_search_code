from datetime import date
from typing import List, Optional

import httpx

from app.config import settings
from app.models.article import Article
from app.interfaces.search_client import ISearchClient

# Базовый URL Scopus Search API
SCOPUS_BASE_URL = "https://api.elsevier.com/content/search/scopus"

# Поля Scopus Search API, доступные при бесплатном API-ключе (STANDARD view):
# dc:title              — название статьи
# prism:publicationName — название журнала
# dc:creator            — первый автор
# prism:coverDate       — дата публикации
# prism:doi             — DOI статьи
# citedby-count         — число цитирований
# subtypeDescription    — тип документа (Article, Review, Conference Paper...)
# openaccess            — флаг открытого доступа (0 или 1)
# affiliation           — вложенный объект с организацией и страной автора
#
# Поля ниже требуют view=COMPLETE (институциональный доступ) и с бесплатным
# ключом не возвращаются — исключены из запроса:
#   authkeywords, dc:description (abstract), fund-sponsor
SCOPUS_FIELDS = (
    "dc:title,prism:publicationName,dc:creator,prism:coverDate,prism:doi,"
    "citedby-count,subtypeDescription,openaccess,affiliation"
)

# Маппинг человекочитаемых названий типов документов на коды Scopus DOCTYPE.
# Ключи соответствуют значениям subtypeDescription из Scopus API
# и полю document_type в таблице articles.
DOCTYPE_MAP: dict[str, str] = {
    "Article": "ar",
    "Review": "re",
    "Conference Paper": "cp",
    "Book Chapter": "ch",
    "Editorial": "ed",
    "Letter": "le",
    "Note": "no",
    "Short Survey": "sh",
}


class ScopusHTTPClient(ISearchClient):
    # Принимаем готовый httpx.AsyncClient снаружи (Dependency Injection).
    # Клиент создается один раз внутри get_scopus_client и живет один запрос.
    # _last_rate_* — backing fields для @property, реализующих контракт ISearchClient.
    def __init__(self, http_client: httpx.AsyncClient):
        self._client = http_client
        self._last_rate_limit: Optional[str] = None
        self._last_rate_remaining: Optional[str] = None
        self._last_rate_reset: Optional[str] = None

    @property
    def last_rate_limit(self) -> Optional[str]:
        return self._last_rate_limit

    @property
    def last_rate_remaining(self) -> Optional[str]:
        return self._last_rate_remaining

    @property
    def last_rate_reset(self) -> Optional[str]:
        return self._last_rate_reset

    def build_query(self, keyword: str, filters: dict | None = None) -> str:
        # Собирает CQL-строку для Scopus Search API из ключевого слова и фильтров.
        # Базовая часть — поиск по заголовку, аннотации и ключевым словам.
        # Все дополнительные клаузы добавляются через AND.
        parts = [f"TITLE-ABS-KEY({keyword})"]

        if not filters:
            return parts[0]

        # Фильтр по диапазону лет: PUBYEAR > (year_from - 1) AND PUBYEAR < (year_to + 1)
        # Scopus использует строгое неравенство, поэтому сдвигаем границы на 1
        if year_from := filters.get("year_from"):
            parts.append(f"PUBYEAR > {int(year_from) - 1}")
        if year_to := filters.get("year_to"):
            parts.append(f"PUBYEAR < {int(year_to) + 1}")

        # Фильтр по типам документов: DOCTYPE(ar) OR DOCTYPE(re) и т.д.
        # Несколько типов объединяются через OR внутри общей AND-клаузы
        doc_types: list[str] = filters.get("document_types") or []
        if doc_types:
            dtype_clauses = " OR ".join(
                f"DOCTYPE({DTYPE_CODE})"
                for dt in doc_types
                if (DTYPE_CODE := DOCTYPE_MAP.get(dt))  # Пропускаем неизвестные значения
            )
            if dtype_clauses:
                parts.append(f"({dtype_clauses})")

        # Фильтр по открытому доступу: OA(1) — только open access статьи
        if filters.get("open_access"):
            parts.append("OA(1)")

        # Фильтр по странам аффиляции: AFFILCOUNTRY(Germany) OR AFFILCOUNTRY(France)
        countries: list[str] = filters.get("countries") or []
        if countries:
            country_clauses = " OR ".join(
                f"AFFILCOUNTRY({c})" for c in countries
            )
            parts.append(f"({country_clauses})")

        return " AND ".join(parts)

    async def search(
        self,
        keyword: str,
        count: int = 25,
        filters: dict | None = None,  # Параметры серверной фильтрации
    ) -> List[Article]:
        page_size = min(count, 25)

        params = {
            "query": self.build_query(keyword, filters),  # Используем публичный метод по контракту
            "count": page_size,
            "field": SCOPUS_FIELDS,
            "apiKey": settings.SCOPUS_API_KEY,
        }

        response = await self._client.get(SCOPUS_BASE_URL, params=params)

        # Сохраняем лимиты из заголовков ответа через backing fields
        self._last_rate_limit = response.headers.get("X-RateLimit-Limit")
        self._last_rate_remaining = response.headers.get("X-RateLimit-Remaining")
        self._last_rate_reset = response.headers.get("X-RateLimit-Reset")

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

            # keyword и is_seeded не передаются:
            # keyword=None (nullable после миграции 0006, будет удалена в 0007)
            # is_seeded берет server_default=false из БД
            article = Article(
                title=title[:500],
                journal=journal[:500] if journal else None,
                author=creator[:255] if creator else None,
                publication_date=cover_date,
                doi=doi[:255] if doi else None,
                cited_by_count=cited_by_count,
                document_type=document_type[:100] if document_type else None,
                open_access=open_access,
                affiliation_country=affiliation_country[:100] if affiliation_country else None,
            )
            articles.append(article)

        return articles
