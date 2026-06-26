import pytest

from app.interfaces.user_repository import IUserRepository
from app.models.user import User
from app.schemas.user_schemas import UserRegisterRequest
from app.services.user_service import UserService


# 1. Фикстура с autouse=True для замены хэширования на заглушку для сокращения времени выполения теста
@pytest.fixture(autouse=True)
def mock_password_hashing(monkeypatch):
    # Подменяем импортированную функцию hash_password в модуле user_service на лямбда-функцию
    monkeypatch.setattr("app.services.user_service.hash_password", lambda password: f"mocked_hash_{password}")


# 2. Создаем Fake-репозиторий (Заглушку), реализующий интерфейс IUserRepository
class FakeUserRepository(IUserRepository):
    def __init__(self):
        # Имитируем базу данных с помощью словаря в памяти
        self.db: dict[str, User] = {}
        self.current_id = 1

    async def create(self, user: User) -> User:
        # Имитируем сохранение в БД и присвоение ID
        user.id = self.current_id
        self.db[user.email] = user
        self.current_id += 1
        return user

    async def get_by_email(self, email: str) -> User | None:
        # Имитируем SELECT * FROM users WHERE email = ?
        return self.db.get(email)


# 3. Фикстура pytest для предоставления чистого UserService в каждый тест
@pytest.fixture
def user_service() -> UserService:
    # Благодаря Dependency Injection, мы "впрыскиваем" Fake-репозиторий вместо Postgres
    fake_repo = FakeUserRepository()
    return UserService(user_repo=fake_repo)


# 4. Сам тест успешной регистрации
@pytest.mark.asyncio
async def test_register_user_success(user_service: UserService):
    # Установка (Arrange): Подготавливаем входные данные
    request_data = UserRegisterRequest(
        username="test_user",
        email="test@example.com",
        password="StrongPassword123!",
        password_confirm="StrongPassword123!",
    )

    # Действие (Act): Вызываем тестируемый метод бизнес-логики
    created_user = await user_service.register(request_data)

    # Проверка (Assert): Убеждаемся, что логика отработала верно
    assert created_user.email == "test@example.com"
    assert created_user.username == "test_user"
    assert created_user.id == 1
    assert created_user.hashed_password != "StrongPassword123!"  # Пароль должен быть хеширован


# 5. Тест регистрации с уже существующим email
@pytest.mark.asyncio
async def test_register_user_duplicate_email(user_service: UserService):
    # Arrange
    request_data = UserRegisterRequest(
        username="test_user",
        email="duplicate@example.com",
        password="StrongPassword123!",
        password_confirm="StrongPassword123!",
    )
    # Сначала успешно регистрируем пользователя
    await user_service.register(request_data)

    # Act & Assert: Ожидаем, что повторная регистрация вызовет ValueError
    with pytest.raises(ValueError) as exc_info:
        await user_service.register(request_data)

    assert str(exc_info.value) == "Пользователь с таким email уже существует"


# 6. login: несуществующий email → ValueError (ветка «not user»)
@pytest.mark.asyncio
async def test_login_unknown_email_raises(user_service: UserService):
    with pytest.raises(ValueError) as exc_info:
        await user_service.login("nonexistent@example.com", "anypassword")
    assert "Неверный email или пароль" in str(exc_info.value)


# 7. get_current_user: пользователь найден
@pytest.mark.asyncio
async def test_get_current_user_returns_user(user_service: UserService):
    data = UserRegisterRequest(
        username="cu_user",
        email="cu@example.com",
        password="Str0ngPass!",
        password_confirm="Str0ngPass!",
    )
    await user_service.register(data)
    user = await user_service.get_current_user("cu@example.com")
    assert user is not None
    assert user.email == "cu@example.com"


# 8. get_current_user: неизвестный email → None
@pytest.mark.asyncio
async def test_get_current_user_unknown_returns_none(user_service: UserService):
    result = await user_service.get_current_user("nobody@example.com")
    assert result is None


# 9. get_or_create_by_google: новый пользователь — весь путь создания
@pytest.mark.asyncio
async def test_get_or_create_by_google_new_user(user_service: UserService):
    at, user_id = await user_service.get_or_create_by_google("google@example.com", "Google User")
    assert at  # ненулевой AT
    assert user_id == 1
    created = await user_service.get_current_user("google@example.com")
    assert created is not None
    assert created.username == "Google User"


# 10. get_or_create_by_google: пользователь уже существует — не создаёт нового
@pytest.mark.asyncio
async def test_get_or_create_by_google_existing_user(user_service: UserService):
    data = UserRegisterRequest(
        username="existing",
        email="existing@example.com",
        password="Str0ngPass!",
        password_confirm="Str0ngPass!",
    )
    existing = await user_service.register(data)
    existing_id = existing.id

    at, user_id = await user_service.get_or_create_by_google("existing@example.com", "Any Name")
    assert user_id == existing_id  # тот же пользователь, новый не создаётся
    assert at
