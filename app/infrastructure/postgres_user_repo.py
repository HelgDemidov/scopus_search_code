from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.services.interfaces.user_repository import IUserRepository


class PostgresUserRepository(IUserRepository):
    # Через __init__ мы передаем сессию БД внутрь репозитория
    def __init__(self, session: AsyncSession):
        self.session = session

    async def create(self, user: User) -> User:
        self.session.add(user)          # Добавляем в транзакцию
        await self.session.commit()     # Сохраняем в БД
        await self.session.refresh(user)# Обновляем объект (чтобы база выдала ему сгенерированный ID)
        return user

    async def get_by_email(self, email: str) -> User | None:
        # Пишем SQL-запрос через Python (SELECT * FROM users WHERE email = ...)
        stmt = select(User).where(User.email == email)
        result = await self.session.execute(stmt)
        # scalar_one_or_none() выдаст одну запись либо None
        return result.scalar_one_or_none()
