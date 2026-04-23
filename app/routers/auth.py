print("[auth] Router module loading", flush=True)

import secrets

from authlib.integrations.starlette_client import OAuth
from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse, RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.requests import Request
from starlette.status import HTTP_302_FOUND, HTTP_401_UNAUTHORIZED

from app.config import settings
from app.core.dependencies import get_db_session
from app.core.refresh_token_utils import (
    create_refresh_token,
    get_valid_refresh_token,
    revoke_refresh_token,
)
from app.core.security import create_access_token
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

# Константа для httpOnly cookie с refresh token
_RT_COOKIE_NAME = "refresh_token"
_RT_COOKIE_MAX_AGE = 30 * 24 * 3600  # 30 дней в секундах


def _set_rt_cookie(response: JSONResponse | RedirectResponse, token: str) -> None:
    """Устанавливает httpOnly cookie с refresh token — единое место настройки."""
    response.set_cookie(
        key=_RT_COOKIE_NAME,
        value=token,
        httponly=True,    # недоступен JavaScript — защита от XSS
        secure=True,      # только HTTPS
        samesite="none",  # cross-origin XHR (Vercel → Railway); CSRF закрыт через
                          # X-Requested-With + CORS allow_origins + RT ротацию
        max_age=_RT_COOKIE_MAX_AGE,
        path="/",
    )


@router.get("/google/login")
async def google_login(request: Request) -> RedirectResponse:
    print("[auth] google_login: handler called", flush=True)
    # Формируем URL авторизации Google и перенаправляем пользователя
    # SessionMiddleware сохранит state в подписанной cookie для защиты от CSRF
    redirect_uri = settings.OAUTH_REDIRECT_URI
    return await oauth.google.authorize_redirect(request, redirect_uri, prompt="select_account")


@router.get("/google/callback")
async def google_callback(
    request: Request,
    session: AsyncSession = Depends(get_db_session),
) -> RedirectResponse:
    print("[auth] google_callback: handler called", flush=True)
    # Обмениваем code на токен Google и извлекаем userinfo
    token = await oauth.google.authorize_access_token(request)
    user_info = token.get("userinfo") or {}

    email: str = user_info.get("email", "")
    name: str = user_info.get("name", "")

    repo = PostgresUserRepository(session)
    service = UserService(user_repo=repo)
    jwt_token, user_id = await service.get_or_create_by_google(email=email, name=name)

    # Создаем refresh token и сохраняем в БД
    rt_value = await create_refresh_token(user_id=user_id, session=session)

    # Редиректим фронтенд на /auth/callback?token=<jwt> и устанавливаем RT cookie
    frontend_url = settings.FRONTEND_URL.rstrip("/")
    redirect_url = f"{frontend_url}/auth/callback?token={jwt_token}"
    response = RedirectResponse(url=redirect_url, status_code=HTTP_302_FOUND)
    _set_rt_cookie(response, rt_value)
    return response


@router.post("/refresh")
async def refresh_access_token(
    request: Request,
    session: AsyncSession = Depends(get_db_session),
) -> JSONResponse:
    """Обменивает действующий RT cookie на новый AT + ротирует RT."""
    print("[auth] refresh_access_token: handler called", flush=True)
    # CSRF-guard: браузер не добавляет этот заголовок автоматически ни в формах,
    # ни в img/script тегах — только явный JS-код; preflight блокирует чужие домены
    if request.headers.get("X-Requested-With") != "XMLHttpRequest":
        return JSONResponse(status_code=403, content={"detail": "Forbidden"})

    rt_cookie = request.cookies.get(_RT_COOKIE_NAME)
    if not rt_cookie:
        return JSONResponse(status_code=HTTP_401_UNAUTHORIZED, content={"detail": "No refresh token"})

    rt = await get_valid_refresh_token(rt_cookie, session)
    if not rt:
        return JSONResponse(status_code=HTTP_401_UNAUTHORIZED, content={"detail": "Refresh token expired or revoked"})

    # Ротация RT: отзываем старый, выдаем новый — защита от повторного использования
    await revoke_refresh_token(rt_cookie, session)
    new_rt_value = await create_refresh_token(user_id=rt.user_id, session=session)

    # Получаем email пользователя для создания нового AT (sub = email, как в текущей логике)
    from sqlalchemy import select
    from app.models.user import User
    result = await session.execute(select(User).where(User.id == rt.user_id))
    user = result.scalar_one_or_none()
    if not user:
        return JSONResponse(status_code=HTTP_401_UNAUTHORIZED, content={"detail": "User not found"})

    new_at = create_access_token(subject=user.email)

    response = JSONResponse({"access_token": new_at, "token_type": "bearer"})
    _set_rt_cookie(response, new_rt_value)
    return response


@router.post("/logout")
async def logout(
    request: Request,
    session: AsyncSession = Depends(get_db_session),
) -> JSONResponse:
    """Отзывает RT на сервере и удаляет cookie — сервер-сайд logout."""
    print("[auth] logout: handler called", flush=True)
    rt_cookie = request.cookies.get(_RT_COOKIE_NAME)
    if rt_cookie:
        await revoke_refresh_token(rt_cookie, session)

    response = JSONResponse({"ok": True})
    # Удаляем cookie — max_age=0 удаляет немедленно
    response.delete_cookie(key=_RT_COOKIE_NAME, path="/", httponly=True, secure=True, samesite="none")
    return response
