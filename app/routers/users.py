# app/routers/users.py

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_db_session
from app.core.security import (  # импортируем decode_access_token и oauth2_scheme
    decode_access_token,
    oauth2_scheme,
)
from app.infrastructure.postgres_user_repo import PostgresUserRepository
from app.models.user import User
from app.schemas.user_schemas import (
    PasswordResetRequest,
    TokenResponse,
    UserRegisterRequest,
    UserResponse,
)
from app.services.user_service import UserService

router = APIRouter(prefix="/users", tags=["Users"])

def get_user_service(session: AsyncSession = Depends(get_db_session)) -> UserService:
    repo = PostgresUserRepository(session)
    return UserService(repo)


# определение функции перенесено из security.py
async def get_current_user(
    token: str = Depends(oauth2_scheme), 
    service: UserService = Depends(get_user_service)
) -> User:
    email = decode_access_token(token)
    if not email:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Токен недействителен или истек",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = await service.get_current_user(email)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Пользователь не найден")

    return user


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(
    data: UserRegisterRequest,
    service: UserService = Depends(get_user_service)
) -> User:
    try:
        user = await service.register(data)
        return user
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))

@router.post("/login", response_model=TokenResponse)
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(), 
    service: UserService = Depends(get_user_service)
) -> TokenResponse:
    try:
        token = await service.login(form_data.username, form_data.password) 
        return TokenResponse(access_token=token, token_type="bearer")
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, 
            detail=str(e),
            headers={"WWW-Authenticate": "Bearer"}
        )

@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)) -> User:
    return current_user

@router.post("/password-reset-request", status_code=status.HTTP_200_OK)
async def password_reset_request(
    data: PasswordResetRequest,
    service: UserService = Depends(get_user_service)
) -> dict[str, str]:
    message = await service.request_password_reset(data.email)
    return {"message": message}
