import hashlib
import json
import logging

import httpx

logger = logging.getLogger(__name__)

STATS_CACHE_TTL = 60  # секунды


class UpstashRedisClient:
    """Клиент Upstash Redis REST API (HTTPS, порт 443).

    Railway блокирует TCP 6379/6380 — redis-py не работает.
    Upstash REST — единственный совместимый вариант для Railway (GCP).
    """

    def __init__(self, url: str, token: str) -> None:
        self._url = url.rstrip("/")
        self._headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }

    async def get(self, key: str) -> str | None:
        """Возвращает значение ключа или None если ключ отсутствует."""
        async with httpx.AsyncClient(timeout=2.0) as client:
            resp = await client.get(f"{self._url}/get/{key}", headers=self._headers)
            if resp.status_code != 200:
                return None
            return resp.json().get("result")

    async def setex(self, key: str, seconds: int, value: str) -> None:
        """Сохраняет значение с TTL через pipeline API (надежнее для JSON-значений)."""
        async with httpx.AsyncClient(timeout=2.0) as client:
            resp = await client.post(
                f"{self._url}/pipeline",
                headers=self._headers,
                json=[["SET", key, value, "EX", seconds]],
            )
            resp.raise_for_status()


def make_stats_cache_key(
    countries: list[str] | None,
    doc_types: list[str] | None,
    open_access: bool | None,
    year_from: int | None,
    year_to: int | None,
) -> str:
    """Детерминированный ключ кэша: stats:{sha256[:16](sorted_params_json)}."""
    params = {
        "c": sorted(countries) if countries else None,
        "d": sorted(doc_types) if doc_types else None,
        "oa": open_access,
        "yf": year_from,
        "yt": year_to,
    }
    digest = hashlib.sha256(json.dumps(params, sort_keys=True).encode()).hexdigest()[:16]
    return f"stats:{digest}"


def _build_client() -> "UpstashRedisClient | None":
    from app.config import settings

    if settings.UPSTASH_REDIS_REST_URL and settings.UPSTASH_REDIS_REST_TOKEN:
        return UpstashRedisClient(settings.UPSTASH_REDIS_REST_URL, settings.UPSTASH_REDIS_REST_TOKEN)
    return None


# Синглтон — создается при импорте модуля; None если переменные не заданы
redis_client: UpstashRedisClient | None = _build_client()
