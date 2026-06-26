# app/routers/users.py

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cookie_constants import RT_COOKIE_MAX_AGE, RT_COOKIE_NAME
from app.core.dependencies import get_db_session
from app.core.refresh_token_utils import create_refresh_token
from app.core.security import (
    decode_access_token,
    oauth2_scheme,
)
from app.infrastructure.postgres_user_repo import PostgresUserRepository
from app.models.user import User
from app.schemas.user_schemas import (
    TokenResponse,
    UserLoginRequest,
    UserRegisterRequest,
    UserResponse,
)
from app.services.user_service import UserService

router = APIRouter(prefix="/users", tags=["Users"])


def get_user_service(session: AsyncSession = Depends(get_db_session)) -> UserService:
    repo = PostgresUserRepository(session)
    return UserService(repo)


# Определение функции перенесено из security.py
async def get_current_user(
    token: str = Depends(oauth2_scheme), service: UserService = Depends(get_user_service)
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
async def register(data: UserRegisterRequest, service: UserService = Depends(get_user_service)) -> User:
    try:
        user = await service.register(data)
        return user
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))


@router.post("/login", response_model=TokenResponse)
async def login(
    data: UserLoginRequest,
    service: UserService = Depends(get_user_service),
    session: AsyncSession = Depends(get_db_session),
) -> JSONResponse:
    try:
        at_token, user_id = await service.login(data.email, data.password)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e),
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Создаем refresh token и устанавливаем его в httpOnly cookie
    rt_value = await create_refresh_token(user_id=user_id, session=session)

    response = JSONResponse({"access_token": at_token, "token_type": "bearer"})
    response.set_cookie(
        key=RT_COOKIE_NAME,
        value=rt_value,
        httponly=True,
        secure=True,
        samesite="none",  # cross-origin: Vercel → Railway
        max_age=RT_COOKIE_MAX_AGE,
        path="/",
    )
    return response


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)) -> User:
    return current_user
