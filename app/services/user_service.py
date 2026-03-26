from app.core.security import create_access_token, hash_password, verify_password
from app.models.user import User
from app.schemas.user_schemas import UserRegisterRequest
from app.interfaces.user_repository import IUserRepository


class UserService:
    # Dependency Inversion из SOLID: Dependency Injection: 
    # сервис получает репозиторий через __init__, а не создает его сам
    def __init__(self, user_repo: IUserRepository):
        self.user_repo = user_repo

    async def register(self, data: UserRegisterRequest) -> User:
        #Регистрирует нового пользователя
        # 1. Проверяем, не занят ли email
        existing = await self.user_repo.get_by_email(data.email)
        if existing:
            raise ValueError("Пользователь с таким email уже существует")

        # 2. Создаем ORM-объект с хешированным паролем
        new_user = User(
            username=data.username,
            email=data.email,
            hashed_password=hash_password(data.password),
        )

        # 3. Сохраняем в базу через репозиторий
        return await self.user_repo.create(new_user)

    async def login(self, email: str, password: str) -> str:
        # Аутентифицирует пользователя и возвращает JWT-токен
        # 1. Ищем пользователя в базе
        user = await self.user_repo.get_by_email(email)

        # Best practice: одинаковая ошибка в обоих случаях (нет пользователя / неверный пароль)
        if not user or not verify_password(password, user.hashed_password):
            raise ValueError("Неверный email или пароль")

        # 2. Генерируем и возвращаем токен
        return create_access_token(subject=user.email)

    async def get_current_user(self, email: str) -> User | None:
        # Возвращает объект пользователя по email из JWT-токена
        return await self.user_repo.get_by_email(email)

    async def request_password_reset(self, email: str) -> str:
        # Инициирует процедуру сброса пароля
        # Возвращает одинаковое сообщение независимо от того, есть ли email в базе
        # Это лучшая практика: не раскрывать наличие аккаунта
        # В полноценной реализации здесь был бы вызов email-сервиса
        # Сейчас — безопасная заглушка.
        await self.user_repo.get_by_email(email)  # Вызываем, но не раскрываем результат
        return "Если этот email зарегистрирован, инструкции по сбросу пароля высланы на него."
