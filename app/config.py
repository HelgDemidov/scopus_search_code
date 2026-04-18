from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import PostgresDsn


class Settings(BaseSettings):

    # Указываем Pydantic читать настройки из файла .env
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    # 1. Scopus
    SCOPUS_API_KEY: str

    # 2. База данных (единая строка подключения — Supabase Session Pooler)
    DATABASE_URL: str | PostgresDsn

    # 3. JWT Security
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    # 4. Параметры сидера — optional, основной сервис не зависит от них
    SEEDER_EMAIL: str = ""
    SEEDER_PASSWORD: str = ""
    OPENROUTER_API_KEY: str = ""

    # 5. Google OAuth 2.0 — получить в Google Cloud Console
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    OAUTH_REDIRECT_URI: str = "http://localhost:8000/auth/google/callback"
    # Секрет для подписи OAuth state в cookie (SessionMiddleware)
    SESSION_SECRET_KEY: str = ""

    # 6. URLs фронтенда
    FRONTEND_URL: str = "http://localhost:5173"
    # Список разрешенных CORS-origins через запятую
    # Пример Railway: https://scopus-search-code.vercel.app
    # Пример локально: http://localhost:5173
    # Если не задан — берется FRONTEND_URL как единственный origin
    ALLOWED_ORIGINS: str = ""

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
