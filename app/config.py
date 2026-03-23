from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    
    # Указываем Pydantic читать настройки из файла .env
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    # 1. Scopus
    SCOPUS_API_KEY: str

    # 2. База данных
    DB_HOST: str
    DB_PORT: int
    DB_USER: str
    DB_PASSWORD: str
    DB_NAME: str

    # 3. JWT Security
    SECRET_KEY: str
    ALGORITHM: str = "HS256"  # Значение по умолчанию
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30 # Значение по умолчанию

    # Метод, который сам соберет 5 параметров БД в единую строку-ссылку
    @property
    def database_url(self) -> str:
        return f"postgresql+asyncpg://{self.DB_USER}:{self.DB_PASSWORD}@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"

# Создаем единственный экземпляр настроек (Singleton),
# который мы будем импортировать во все остальные файлы нашего проекта
settings = Settings() # type: ignore