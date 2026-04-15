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

    @property
    def database_url_str(self) -> str:
        return str(self.DATABASE_URL)


# Singleton-экземпляр настроек, который импортируется во все остальные модули проекта
settings = Settings()  # type: ignore
