import secrets as secrets_module

from app.core.security import create_access_token, hash_password, verify_password
from app.models.user import User
from app.schemas.user_schemas import UserRegisterRequest
from app.interfaces.user_repository import IUserRepository


class UserService:
    # Dependency Inversion из SOLID: сервис получает репозиторий через __init__
    def __init__(self, user_repo: IUserRepository):
        self.user_repo = user_repo

    async def register(self, data: UserRegisterRequest) -> User:
        # Регистрирует нового пользователя
        existing = await self.user_repo.get_by_email(data.email)
        if existing:
            raise ValueError("Пользователь с таким email уже существует")

        new_user = User(
            username=data.username,
            email=data.email,
            hashed_password=hash_password(data.password),
        )
        return await self.user_repo.create(new_user)

    async def login(self, email: str, password: str) -> str:
        # Аутентифицирует пользователя и возвращает JWT-токен
        user = await self.user_repo.get_by_email(email)
        # Best practice: одинаковая ошибка в обоих случаях
        if not user or not verify_password(password, user.hashed_password):
            raise ValueError("Неверный email или пароль")
        return create_access_token(subject=user.email)

    async def get_current_user(self, email: str) -> User | None:
        # Возвращает объект пользователя по email из JWT-токена
        return await self.user_repo.get_by_email(email)

    async def request_password_reset(self, email: str) -> str:
        # Инициирует процедуру сброса пароля
        # Best practice: не разкрываем наличие аккаунта в базе
        await self.user_repo.get_by_email(email)
        return "Если этот email зарегистрирован, инструкции по сбросу пароля высланы на него."

    async def get_or_create_by_google(self, email: str, name: str) -> str:
        # Альтернативный путь аутентификации через Google OAuth
        # Ищем существующего пользователя по email
        user = await self.user_repo.get_by_email(email)
        if not user:
            # Пароль случайный — вход через этот аккаунт только через Google
            random_password = secrets_module.token_hex(32)
            username = name.strip() or email.split("@")[0]
            user = User(
                username=username,
                email=email,
                hashed_password=hash_password(random_password),
            )
            user = await self.user_repo.create(user)
        # Возвращаем тот же JWT, что и при обычном логине — фронтенд не знает разницы
        return create_access_token(subject=user.email)
