from pydantic import PostgresDsn
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Указываем Pydantic читать настройки из файла .env
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",  # игнорировать поля из .env, не объявленные в модели
    )

    # 1. Scopus
    SCOPUS_API_KEY: str

    # 2. База данных (единая строка подключения — Supabase Session Pooler)
    DATABASE_URL: str | PostgresDsn

    # 3. JWT Security
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    # 4. Параметры сидера + AI NL→pivot (docs/ai-nl-pivot/spec.md) — optional,
    # graceful degradation: без OPENROUTER_API_KEY сидер и POST /stats/pivot/nl-query
    # недоступны, остальной сервис не затронут. OPENROUTER_API_KEY теперь общий
    # для сидера и NL-фичи — один и тот же ключ/бюджет ($5-10/мес суммарно, §0.2 спеки).
    SEEDER_EMAIL: str = ""
    SEEDER_PASSWORD: str = ""
    OPENROUTER_API_KEY: str = ""

    # 5. Google OAuth 2.0 — получить в Google Cloud Console
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    OAUTH_REDIRECT_URI: str = "http://localhost:8000/auth/google/callback"
    # Секрет для подписи OAuth state в cookie (SessionMiddleware)
    SESSION_SECRET_KEY: str = ""

    # 6. Brevo (HTTPS email API) — для отправки писем сброса пароля
    BREVO_API_KEY: str = ""
    FROM_EMAIL: str = ""

    # 7. Upstash Redis (кэш GET /articles/stats) — опционально, graceful degradation
    # Railway блокирует TCP 6379 — Upstash REST API (HTTPS 443) единственный вариант
    UPSTASH_REDIS_REST_URL: str | None = None
    UPSTASH_REDIS_REST_TOKEN: str | None = None

    # 8. Async-движок БД (app/infrastructure/database.py) — дефолты сохраняют
    # текущее поведение неизменным. echo=True удобен для локальной отладки
    # в один запрос за раз, но синхронно пишет каждый SQL-запрос в консоль и
    # легко доминирует над измеряемой latency под конкурентной нагрузкой;
    # pool_size/max_overflow по умолчанию — это дефолты самого SQLAlchemy
    # QueuePool (5 + 10 = 15 соединений), рассчитанные на интерактивную
    # сессию, а не на N виртуальных пользователей нагрузочного теста.
    # Перед запуском tests/load/ — выставлять через .env: DB_ECHO=false,
    # DB_POOL_SIZE/DB_MAX_OVERFLOW под целевую конкурентность.
    DB_ECHO: bool = True
    DB_POOL_SIZE: int = 5
    DB_MAX_OVERFLOW: int = 10

    # 9. URLs фронтенда
    FRONTEND_URL: str = "http://localhost:5173"
    # Список разрешенных CORS-origins через запятую
    # Пример Railway: https://scopus-search-code.vercel.app
    # Пример локально: http://localhost:5173
    # Если не задан — берется FRONTEND_URL как единственный origin
    ALLOWED_ORIGINS: str = ""

    # 10. Sentry (Observability) — опционально, graceful degradation как Redis/Brevo
    SENTRY_DSN: str | None = None
    SENTRY_TRACES_SAMPLE_RATE: float = 1.0
    # Автоматически подставляется Railway, локально не задана
    RAILWAY_ENVIRONMENT_NAME: str = "local"

    # 11. AI NL→pivot (docs/ai-nl-pivot/spec.md) — rate-limit на платную LLM-модель,
    # 2 уровня (user + global), дневное окно (app/core/nl_pivot_rate_limit.py).
    # Значения — стартовые placeholder'ы, НЕ финальный расчёт (§0/§1 спеки):
    # калибруются по факту трафика через get-credits/Activity dashboard OpenRouter,
    # правка через .env — не передеплой кода (прецедент — DB_POOL_SIZE).
    NL_PIVOT_GLOBAL_DAILY_LIMIT: int = 50
    NL_PIVOT_USER_DAILY_LIMIT: int = 15
    # 2 приоритетных кандидата (§2 спеки, оба поддерживают structured_outputs) — mistral
    # выбран стартовым дефолтом (минимальный интеграционный риск, та же семья, что уже
    # проверена сидером), не финальное решение. Спека сознательно оставляла это поле без
    # дефолта («явное решение на этапе реализации») — на практике потребовало бы
    # OPENROUTER_NL_PIVOT_MODEL в .env/CI/Railway ВЕЗДЕ до первого деплоя/теста; дефолт
    # безопаснее (тот же паттерн graceful degradation, что у остальных полей этого класса)
    # и по-прежнему меняется одной строкой в .env, без правки кода.
    OPENROUTER_NL_PIVOT_MODEL: str = "mistralai/mistral-small-24b-instruct-2501"

    @property
    def cors_origins(self) -> list[str]:
        # Читаем ALLOWED_ORIGINS; если пусто — используем FRONTEND_URL как фоллбэк
        raw = self.ALLOWED_ORIGINS.strip()
        if raw:
            return [o.strip() for o in raw.split(",") if o.strip()]
        return [self.FRONTEND_URL.rstrip("/")]

    @property
    def database_url_str(self) -> str:
        return str(self.DATABASE_URL)


# Singleton-экземпляр настроек, который импортируется во все остальные модули проекта
settings = Settings()  # type: ignore
