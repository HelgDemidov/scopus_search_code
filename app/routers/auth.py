import secrets

from authlib.integrations.starlette_client import OAuth
from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse, RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.requests import Request

from app.config import settings
from app.core.dependencies import get_db_session
from app.infrastructure.postgres_user_repo import PostgresUserRepository
from app.services.user_service import UserService

router = APIRouter(prefix="/auth", tags=["Auth"])

# Инициализируем OAuth-клиент Authlib — отправляет пользователя на Google и обрабатывает callback
oauth = OAuth()
oauth.register(
    name="google",
    client_id=settings.GOOGLE_CLIENT_ID,
    client_secret=settings.GOOGLE_CLIENT_SECRET,
    server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
    client_kwargs={"scope": "openid email profile"},
)


@router.get("/google/login")
async def google_login(request: Request) -> RedirectResponse:
    # Формируем URL авторизации Google и перенаправляем пользователя
    # SessionMiddleware сохранит state в подписанной cookie для защиты от CSRF
    redirect_uri = settings.OAUTH_REDIRECT_URI
    return await oauth.google.authorize_redirect(request, redirect_uri)


@router.get("/google/callback")
async def google_callback(
    request: Request,
    session: AsyncSession = Depends(get_db_session),
) -> JSONResponse:
    # Обмениваем code на токен Google и извлекаем userinfo
    token = await oauth.google.authorize_access_token(request)
    user_info = token.get("userinfo") or {}

    email: str = user_info.get("email", "")
    name: str = user_info.get("name", "")

    repo = PostgresUserRepository(session)
    service = UserService(user_repo=repo)
    jwt_token = await service.get_or_create_by_google(email=email, name=name)

    # Возвращаем тот же JWT-формат, что и POST /users/login
    return JSONResponse({"access_token": jwt_token, "token_type": "bearer"})
