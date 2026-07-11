from fastapi import HTTPException, status

from app.config import settings
from app.infrastructure.redis_client import make_nl_pivot_rate_limit_keys, redis_client

# Дневное окно (docs/ai-nl-pivot/spec.md §1) — ключи уже date-scoped
# (make_nl_pivot_rate_limit_keys), TTL здесь только для уборки Redis'ом.
_RATE_LIMIT_TTL_SECONDS = 86400


async def enforce_nl_pivot_rate_limit(user_id: int) -> None:
    """Двухуровневый rate-limit NL-pivot запросов (docs/ai-nl-pivot/spec.md §1).

    Порядок: user-счётчик первым, затем global. Пользователь, уже упёршийся в свой
    личный лимит, не должен продолжать расходовать общий $-бюджет; легитимный запрос,
    отклонённый только глобальным потолком, всё же тратит 1 единицу личного лимита
    пользователя — принятый trade-off (см. §1 спеки).

    fail-closed при недоступности Redis (HTTPException 503) — отклонение от обычного
    для проекта fail-open (Redis недоступен → прямой запрос к БД, PR #32/#44):
    без счётчика нет способа не превысить $-бюджет платной LLM-модели, пока лимиты
    не откалиброваны живым трафиком. Прецедент 503 — app/routers/health.py:45.
    """
    if redis_client is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI-функция временно недоступна",
        )

    global_key, user_key = make_nl_pivot_rate_limit_keys(user_id, db_namespace=settings.database_url_str)

    user_count = await redis_client.incr_with_ttl(user_key, _RATE_LIMIT_TTL_SECONDS)
    if user_count > settings.NL_PIVOT_USER_DAILY_LIMIT:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Дневной лимит AI-запросов на пользователя исчерпан",
        )

    global_count = await redis_client.incr_with_ttl(global_key, _RATE_LIMIT_TTL_SECONDS)
    if global_count > settings.NL_PIVOT_GLOBAL_DAILY_LIMIT:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Дневной лимит AI-запросов исчерпан, попробуйте завтра",
        )
