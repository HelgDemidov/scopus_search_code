import hashlib
import json
import logging
from datetime import datetime, timezone

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

    async def ping(self) -> bool:
        """Проверка доступности Redis — используется в /health/redis и /seeder/health-check."""
        try:
            async with httpx.AsyncClient(timeout=2.0) as client:
                resp = await client.get(f"{self._url}/ping", headers=self._headers)
            return resp.status_code == 200 and resp.json().get("result") == "PONG"
        except httpx.HTTPError:
            return False

    async def setex(self, key: str, seconds: int, value: str) -> None:
        """Сохраняет значение с TTL через pipeline API (надежнее для JSON-значений)."""
        async with httpx.AsyncClient(timeout=2.0) as client:
            resp = await client.post(
                f"{self._url}/pipeline",
                headers=self._headers,
                json=[["SET", key, value, "EX", seconds]],
            )
            resp.raise_for_status()

    async def incr_with_ttl(self, key: str, ttl_seconds: int) -> int:
        """Атомарный инкремент счётчика с TTL — fixed-window rate-limit
        (docs/ai-nl-pivot/spec.md §1). EXPIRE ... NX выставляет TTL только при первом
        инкременте (создании ключа) — повторные вызовы в пределах окна не сдвигают его
        вперёд, тот же fixed-window паттерн, что уже неявно даёт SET...EX в setex().
        Возвращает значение счётчика ПОСЛЕ инкремента.
        """
        async with httpx.AsyncClient(timeout=2.0) as client:
            resp = await client.post(
                f"{self._url}/pipeline",
                headers=self._headers,
                json=[["INCR", key], ["EXPIRE", key, ttl_seconds, "NX"]],
            )
            resp.raise_for_status()
            results = resp.json()
            return int(results[0]["result"])


def make_stats_cache_key(
    countries: list[str] | None,
    doc_types: list[str] | None,
    open_access: bool | None,
    year_from: int | None,
    year_to: int | None,
    *,
    db_namespace: str,
) -> str:
    """Детерминированный ключ кэша: stats:{ns_digest}:{sha256[:16](sorted_params_json)}.

    db_namespace (обычно DATABASE_URL текущего окружения) изолирует ключи между
    production и staging: оба Railway-окружения используют один физический
    Upstash Redis (нет отдельной инстанции на окружение, в отличие от Supabase),
    а сами параметры фильтров совпадают для "статистики без фильтров" — без
    этой изоляции e2e.yml, дергая GET /articles/stats на staging при каждом
    push в main, перезаписывал общий ключ staging-данными (найдено 2026-07-02:
    прод на минуту показывал 1675 статей вместо ~118 тыс. — ровно столько,
    сколько их в staging Supabase).
    """
    params = {
        "c": sorted(countries) if countries else None,
        "d": sorted(doc_types) if doc_types else None,
        "oa": open_access,
        "yf": year_from,
        "yt": year_to,
    }
    digest = hashlib.sha256(json.dumps(params, sort_keys=True).encode()).hexdigest()[:16]
    ns_digest = hashlib.sha256(db_namespace.encode()).hexdigest()[:8]
    return f"stats:{ns_digest}:{digest}"


def make_journal_impact_cache_key(max_year: int, *, db_namespace: str) -> str:
    """Ключ кэша для /stats/journal-impact: journal-impact:{ns_digest}:{max_year}.

    В отличие от make_stats_cache_key — без хэша параметров: max_year это слайдер
    ровно на 3 значения (2022-2024, docs/explore-table-builder/spec.md §1.1), а не
    произвольная комбинация фильтров, поэтому читаемый прямой ключ нагляднее хэша.
    db_namespace — та же изоляция prod/staging, что и в make_stats_cache_key.
    """
    ns_digest = hashlib.sha256(db_namespace.encode()).hexdigest()[:8]
    return f"journal-impact:{ns_digest}:{max_year}"


def make_nl_pivot_rate_limit_keys(user_id: int, *, db_namespace: str) -> tuple[str, str]:
    """Ключи rate-limit для NL-pivot: (global, user) — дневное окно, docs/ai-nl-pivot/spec.md §1.
    Дата — часть ключа (не только TTL): новый день = новый ключ = счётчик с нуля,
    TTL нужен лишь для уборки мусора Redis'ом, а не для корректности окна.
    db_namespace — та же изоляция prod/staging, что make_stats_cache_key (см. PR #32).
    """
    ns_digest = hashlib.sha256(db_namespace.encode()).hexdigest()[:8]
    today = datetime.now(timezone.utc).date().isoformat()
    return (
        f"nl-pivot:global:{ns_digest}:{today}",
        f"nl-pivot:user:{ns_digest}:{user_id}:{today}",
    )


def _build_client() -> "UpstashRedisClient | None":
    from app.config import settings

    if settings.UPSTASH_REDIS_REST_URL and settings.UPSTASH_REDIS_REST_TOKEN:
        return UpstashRedisClient(settings.UPSTASH_REDIS_REST_URL, settings.UPSTASH_REDIS_REST_TOKEN)
    return None


# Синглтон — создается при импорте модуля; None если переменные не заданы
redis_client: UpstashRedisClient | None = _build_client()
