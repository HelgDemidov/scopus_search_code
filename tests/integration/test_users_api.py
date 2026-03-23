import pytest
from httpx import AsyncClient


# 1. Тест успешной регистрации пользователя
@pytest.mark.asyncio
async def test_register_user_integration(async_client: AsyncClient):
    # Arrange: Подготавливаем JSON-payload, который фронтенд отправил бы на сервер
    payload = {
        "username": "integration_user",
        "email": "integration@example.com",
        "password": "StrongPassword123!",
        "password_confirm": "StrongPassword123!"
    }

    # Act: Выполняем реальный HTTP POST-запрос через тестовый клиент FastAPI
    response = await async_client.post("/users/register", json=payload)
    
    # Assert: Проверяем статус-код и структуру ответа
    assert response.status_code == 201
    
    data = response.json()
    assert data["email"] == "integration@example.com"
    assert data["username"] == "integration_user"
    assert "id" in data
    # Убеждаемся, что пароль не "утек" в публичный ответ API
    assert "password" not in data 
    assert "hashed_password" not in data

# 2. Тест регистрации с существующим email (Проверка обработки ошибок роутером)
@pytest.mark.asyncio
async def test_register_duplicate_email_integration(async_client: AsyncClient):
    # Arrange: Тот же самый payload
    payload = {
        "username": "duplicate_user",
        "email": "duplicate@example.com",
        "password": "StrongPassword123!",
        "password_confirm": "StrongPassword123!"
    }
    
    # Act 1: Первичная регистрация (должна пройти успешно)
    await async_client.post("/users/register", json=payload)
    
    # Act 2: Повторная попытка регистрации с тем же payload
    response = await async_client.post("/users/register", json=payload)
    
    # Assert: Ожидаем, что FastAPI корректно поймает ValueError из сервиса 
    # и превратит его в 409 Conflict (как мы прописали в app/routers/users.py)
    assert response.status_code == 409
    assert response.json()["detail"] == "Пользователь с таким email уже существует"

# 3. Тест логина и получения JWT токена
@pytest.mark.asyncio
async def test_login_integration(async_client: AsyncClient):
    # Arrange: Регистрируем пользователя
    register_payload = {
        "username": "login_user",
        "email": "login@example.com",
        "password": "StrongPassword123!",
        "password_confirm": "StrongPassword123!"
    }
    await async_client.post("/users/register", json=register_payload)

    # Act: Пытаемся залогиниться. 
    # ВАЖНО: Swagger (и OAuth2PasswordRequestForm) использует формат form-data, а не JSON
    login_payload = {
        "username": "login@example.com",  # В OAuth2 поле называется username, даже если туда передают email
        "password": "StrongPassword123!"
    }
    # Используем параметр data=... вместо json=... для эмуляции x-www-form-urlencoded
    response = await async_client.post("/users/login", data=login_payload)
    
    # Assert
    assert response.status_code == 200
    
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    # Убеждаемся, что токен не пустой
    assert len(data["access_token"]) > 20
