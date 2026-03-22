from abc import ABC, abstractmethod
from app.models.user import User

class IUserRepository(ABC):
    # Абстрактный класс (интерфейс)

    @abstractmethod
    async def create(self, user: User) -> User:
        # Сохраняет нового пользователя в базу
        pass

    @abstractmethod
    async def get_by_email(self, email: str) -> User | None:
        # Ищет пользователя по email. Возвращает User или None, если не найден
        pass
