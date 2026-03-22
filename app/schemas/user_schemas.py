import re
from datetime import datetime
from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator
from typing import Self

class UserRegisterRequest(BaseModel):
    # Пользовательские данные при регистрации
    username: str = Field(min_length=3, max_length=50)
    email: EmailStr
    password: str = Field(min_length=8, max_length=255)
    password_confirm: str = Field(min_length=8, max_length=255)

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        # Проверка на допустимые символы (только ASCII: латиница, цифры, спецсимволы)
        if not re.match(r"^[\x20-\x7E]+$", v):
            raise ValueError("Пароль может содержать только латинские буквы, цифры и стандартные спецсимволы")
            
        if not any(c.isupper() for c in v):
            raise ValueError("Пароль должен содержать хотя бы одну заглавную букву")
        if not any(c.islower() for c in v):
            raise ValueError("Пароль должен содержать хотя бы одну строчную букву")
        if not any(c.isdigit() for c in v):
            raise ValueError("Пароль должен содержать хотя бы одну цифру")
        if not re.search(r"[!@#$%^&*()_+=\-\[\]{};':\"\\|,.<>/?]", v):
            raise ValueError("Пароль должен содержать хотя бы один спецсимвол")
        return v

    @model_validator(mode="after")
    def passwords_match(self) -> Self:
        # Проверка совпадения пароля с введенным ползователем подтверждением пароля
        if self.password != self.password_confirm:
            raise ValueError("Пароли не совпадают")
        return self

class UserLoginRequest(BaseModel):
    # Данные для входа (аутентификации) зарегистрированного пользователя
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    # То, что мы отдаем клиенту
    id: int
    username: str | None
    email: str
    created_at: datetime | None = None  # <-- Обрати внимание на синтаксис!

    # Разрешаем Pydantic читать данные из ORM-объекта (не только из словаря)
    model_config = {"from_attributes": True}

class TokenResponse(BaseModel):
    # Ответ при успешном логине: JWT-токен и его тип
    access_token: str
    token_type: str = "bearer"

class PasswordResetRequest(BaseModel):
    # Запрос сброса пароля: клиент присылает только email
    email: EmailStr
