import logging
from datetime import date
from typing import List, Optional

import httpx

from app.config import settings
from app.models.article import Article
from app.interfaces.search_client import ISearchClient

logger = logging.getLogger(__name__)

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

# Маппинг: human-readable метка из UI → код типа документа в CQL Scopus
# Источник: https://dev.elsevier.com/tips/ScopusSearchTips.htm (DOCTYPE)
_DOC_TYPE_MAP: dict[str, str] = {
    "Article": "ar",
    "Review": "re",
    "Conference Paper": "cp",
    "Book": "bk",
    "Book Chapter": "ch",
    "Letter": "le",
    "Editorial": "ed",
    "Note": "no",
    "Short Survey": "sh",
}


class ScopusHTTPClient(ISearchClient):
    # Принимаем готовый httpx.AsyncClient снаружи (Dependency Injection).
    # Клиент создается один раз внутри get_scopus_client и живет один запрос.
    # _last_rate_* — backing fields для @property, реализующих контракт ISearchClient.
    # _last_cql_query — последний сформированный CQL-запрос; используется
    #   SearchService для сохранения в search_history.filters.
    def __init__(self, http_client: httpx.AsyncClient):
        self._client = http_client
        self._last_rate_limit: Optional[str] = None
        self._last_rate_remaining: Optional[str] = None
        self._last_rate_reset: Optional[str] = None
        self._last_cql_query: Optional[str] = None

    @property
    def last_rate_limit(self) -> Optional[str]:
        return self._last_rate_limit

    @property
    def last_rate_remaining(self) -> Optional[str]:
        return self._last_rate_remaining

    @property
    def last_rate_reset(self) -> Optional[str]:
        return self._last_rate_reset

    @property
    def last_cql_query(self) -> Optional[str]:
        # Возвращает CQL-строку последнего вызова search().
        # None, если search() ещё не вызывался на этом экземпляре.
        return self._last_cql_query

    def _build_query(self, keyword: str, filters: dict | None) -> str:
        """Строит CQL-запрос Scopus из ключевого слова и опциональных фильтров.

        Правила построения (ТЗ §3.1 Слой 2):
          - Базовый предикат: TITLE-ABS-KEY("{keyword}")
          - year_from  → AND PUBYEAR > {year_from - 1}
          - year_to    → AND PUBYEAR < {year_to + 1}
          - doc_types  → AND DOCTYPE(ar,re,...) через _DOC_TYPE_MAP
          - open_access → AND OA(1)
          - country    → AND AFFILCOUNTRY("United States",Russia,...)
        Многословные страны оборачиваются в кавычки; однословные — без.
        Неизвестные doc_type-значения передаются as-is в lowercase + WARNING.
        """
        # Ключевое слово всегда оборачиваем в кавычки для точного CQL-матча
        parts: list[str] = [f'TITLE-ABS-KEY("{keyword}")']

        if not filters:
            return parts[0]

        # Диапазон годов публикации
        if (year_from := filters.get("year_from")) is not None:
            parts.append(f"PUBYEAR > {int(year_from) - 1}")
        if (year_to := filters.get("year_to")) is not None:
            parts.append(f"PUBYEAR < {int(year_to) + 1}")

        # Типы документов: маппинг через _DOC_TYPE_MAP; неизвестные — as-is lowercase
        if doc_types := filters.get("doc_types"):
            codes: list[str] = []
            for dt in doc_types:
                if not dt:
                    continue
                code = _DOC_TYPE_MAP.get(dt)
                if code is None:
                    logger.warning(
                        "Unknown doc_type value '%s'; passing as-is to Scopus CQL", dt
                    )
                    code = dt.lower()
                codes.append(code)
            if codes:
                parts.append(f"DOCTYPE({','.join(codes)})")

        # Open Access
        if filters.get("open_access"):
            parts.append("OA(1)")

        # Страны аффиляции: многословные — в кавычках, однословные — без
        if countries := filters.get("country"):
            formatted: list[str] = []
            for c in countries:
                if not c:
                    continue
                formatted.append(f'"{c}"' if " " in c else c)
            if formatted:
                parts.append(f"AFFILCOUNTRY({','.join(formatted)})")

        return " AND ".join(parts)

    async def search(
        self,
        keyword: str,
        count: int = 25,
        filters: dict | None = None,
    ) -> List[Article]:
        page_size = min(count, 25)

        # Строим CQL-запрос с фильтрами и сохраняем для SearchService
        cql_query = self._build_query(keyword, filters)
        self._last_cql_query = cql_query

        params = {
            "query": cql_query,
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
