import httpx
from typing import List
from datetime import date

from app.models.article import Article
from app.services.interfaces.search_client import ISearchClient
from app.config import settings

# Базовый URL Scopus Search API (актуальный endpoint)
SCOPUS_BASE_URL = "https://api.elsevier.com/content/search/scopus"

# Поля, которые мы запрашиваем у API (только то, что нам нужно — экономим трафик)
SCOPUS_FIELDS = "prism:publicationName,dc:creator,prism:coverDate,prism:doi"


class ScopusHTTPClient(ISearchClient):
    # Принимаем готовый httpx.AsyncClient снаружи (Dependency Injection).
    # Клиент создается один раз при старте приложения (в Lifespan) и живет всегда.
    # Это эффективнее, чем создавать новое соединение на каждый запрос.
    def __init__(self, http_client: httpx.AsyncClient):
        self.http_client = http_client

    async def search(self, keyword: str, count: int = 10) -> List[Article]:
        # Формируем параметры запроса согласно документации Scopus Search API
        params = {
            "query": f"TITLE-ABS-KEY({keyword})",  # Поиск по заголовку, реферату, ключевым словам
            "count": count,
            "field": SCOPUS_FIELDS,
            "httpAccept": "application/json",
        }

        headers = {
            "X-ELS-APIKey": settings.SCOPUS_API_KEY,
            "Accept": "application/json",
        }

        response = await self.http_client.get(
            SCOPUS_BASE_URL,
            params=params,
            headers=headers,
            timeout=15.0  # Ждем максимум 15 секунд
        )

        # Если API вернул ошибку (401, 404, 429 и т.д.) — поднимаем исключение
        response.raise_for_status()

        # Парсим JSON-ответ от Scopus
        data = response.json()
        entries = data.get("search-results", {}).get("entry", [])

        # Преобразуем каждую запись из JSON в наш ORM-объект Article
        articles = []
        for entry in entries:
            raw_date = entry.get("prism:coverDate", "")
            try:
                parsed_date = date.fromisoformat(raw_date)
            except (ValueError, TypeError):
                # Если дата в неожиданном формате — ставим заглушку
                parsed_date = date(1900, 1, 1)

            article = Article(
                title=entry.get("prism:publicationName", "Unknown"),
                author=entry.get("dc:creator", None),
                date=parsed_date,
                doi=entry.get("prism:doi", None),
                keyword=keyword,
            )
            articles.append(article)

        return articles
