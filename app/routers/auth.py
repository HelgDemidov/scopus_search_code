from authlib.integrations.starlette_client import OAuth
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse, RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.requests import Request
from starlette.status import HTTP_302_FOUND, HTTP_401_UNAUTHORIZED

from app.config import settings
from app.core.cookie_constants import (
    AT_HANDSHAKE_COOKIE_NAME,
    AT_HANDSHAKE_MAX_AGE,
    RT_COOKIE_MAX_AGE,
    RT_COOKIE_NAME,
)
from app.core.dependencies import get_db_session, get_email_service
from app.core.password_reset_utils import create_password_reset_token, get_valid_reset_token
from app.core.refresh_token_utils import (
    cleanup_stale_tokens,
    create_refresh_token,
    get_valid_refresh_token,
    revoke_all_user_tokens,
    revoke_refresh_token,
)
from app.core.security import create_access_token, hash_password
from app.infrastructure.postgres_user_repo import PostgresUserRepository
from app.interfaces.email_service import IEmailService
from app.models.user import User
from app.schemas.user_schemas import PasswordResetConfirmRequest, PasswordResetRequest
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


def _set_rt_cookie(response: JSONResponse | RedirectResponse, token: str) -> None:
    """Устанавливает httpOnly cookie с refresh token — единое место настройки."""
    response.set_cookie(
        key=RT_COOKIE_NAME,
        value=token,
        httponly=True,  # недоступен JavaScript — защита от XSS
        secure=True,  # только HTTPS
        samesite="none",  # cross-origin XHR (Vercel → Railway); CSRF закрыт через
        # X-Requested-With + CORS allow_origins + RT ротацию
        max_age=RT_COOKIE_MAX_AGE,
        path="/",
    )


def _set_at_handshake_cookie(response: RedirectResponse, token: str) -> None:
    """Короткоживущая НЕ-httpOnly cookie для передачи AT через cross-origin redirect.

    Проблема: браузеры (Chrome 80+, Firefox 96+, Safari 14+) отбрасывают
    Set-Cookie при cross-site redirect согласно RFC 6265bis §5.4.
    Решение: устанавливаем обе cookie на одном ответе RedirectResponse —
    браузер сохраняет их до выполнения редиректа.
    OAuthCallback.tsx читает auth_handshake через document.cookie (не httpOnly)
    и немедленно удаляет её — окно доступности минимально (несколько секунд).
    """
    response.set_cookie(
        key=AT_HANDSHAKE_COOKIE_NAME,
        value=token,
        httponly=False,  # читается JS в OAuthCallback.tsx
        secure=True,  # только HTTPS
        samesite="none",  # cross-origin: Railway → Vercel
        max_age=AT_HANDSHAKE_MAX_AGE,
        path="/",
    )


@router.get("/google/login")
async def google_login(request: Request) -> RedirectResponse:
    # Формируем URL авторизации Google и перенаправляем пользователя
    # SessionMiddleware сохранит state в подписанной cookie для защиты от CSRF
    redirect_uri = settings.OAUTH_REDIRECT_URI
    return await oauth.google.authorize_redirect(request, redirect_uri, prompt="select_account")


@router.get("/google/callback")
async def google_callback(
    request: Request,
    session: AsyncSession = Depends(get_db_session),
) -> RedirectResponse:
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

    # Редиректим фронтенд на /auth/callback БЕЗ token в URL —
    # AT передается через короткоживущую handshake cookie (не httpOnly),
    # RT — через httpOnly cookie. Оба Set-Cookie идут на один ответ,
    # поэтому браузер сохраняет их до выполнения редиректа.
    frontend_url = settings.FRONTEND_URL.rstrip("/")
    redirect_url = f"{frontend_url}/auth/callback"
    response = RedirectResponse(url=redirect_url, status_code=HTTP_302_FOUND)
    _set_rt_cookie(response, rt_value)
    _set_at_handshake_cookie(response, jwt_token)
    return response


@router.post("/refresh")
async def refresh_access_token(
    request: Request,
    session: AsyncSession = Depends(get_db_session),
) -> JSONResponse:
    """Обменивает действующий RT cookie на новый AT + ротирует RT."""
    # CSRF-guard: браузер не добавляет этот заголовок автоматически ни в формах,
    # ни в img/script тегах — только явный JS-код; preflight блокирует чужие домены
    if request.headers.get("X-Requested-With") != "XMLHttpRequest":
        return JSONResponse(status_code=403, content={"detail": "Forbidden"})

    rt_cookie = request.cookies.get(RT_COOKIE_NAME)
    if not rt_cookie:
        return JSONResponse(status_code=HTTP_401_UNAUTHORIZED, content={"detail": "No refresh token"})

    rt = await get_valid_refresh_token(rt_cookie, session)
    if not rt:
        return JSONResponse(
            status_code=HTTP_401_UNAUTHORIZED,
            content={"detail": "Refresh token expired or revoked"},
        )

    # Ротация RT: отзываем старый, выдаем новый — защита от повторного использования
    await revoke_refresh_token(rt_cookie, session)
    new_rt_value = await create_refresh_token(user_id=rt.user_id, session=session)
    # Piggyback cleanup: удаляем устаревшие RT пользователя попутно при ротации
    await cleanup_stale_tokens(user_id=rt.user_id, session=session)

    # Получаем email пользователя для создания нового AT (sub = email, как в текущей логике)
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
    rt_cookie = request.cookies.get(RT_COOKIE_NAME)
    if rt_cookie:
        await revoke_refresh_token(rt_cookie, session)

    response = JSONResponse({"ok": True})
    # Удаляем cookie — max_age=0 удаляет немедленно
    response.delete_cookie(key=RT_COOKIE_NAME, path="/", httponly=True, secure=True, samesite="none")
    return response


@router.post("/password-reset")
async def request_password_reset(
    data: PasswordResetRequest,
    session: AsyncSession = Depends(get_db_session),
    email_svc: IEmailService = Depends(get_email_service),
) -> JSONResponse:
    """Инициирует сброс пароля — всегда 200, не раскрывает наличие аккаунта."""
    result = await session.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()
    if user:
        token = await create_password_reset_token(user_id=user.id, session=session)
        reset_url = f"{settings.FRONTEND_URL.rstrip('/')}/reset-password?token={token}"
        await email_svc.send_password_reset_email(user.email, reset_url)
    return JSONResponse({"message": "If this email is registered, a reset link has been sent."})


@router.post("/password-reset/confirm")
async def confirm_password_reset(
    data: PasswordResetConfirmRequest,
    session: AsyncSession = Depends(get_db_session),
) -> JSONResponse:
    """Применяет новый пароль — атомарно помечает токен использованным, отзывает все RT."""
    prt = await get_valid_reset_token(data.token, session)
    if prt is None:
        raise HTTPException(status_code=422, detail="Токен недействителен или истёк")

    result = await session.execute(select(User).where(User.id == prt.user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=422, detail="Токен недействителен или истёк")

    # Атомарно: сменить пароль + пометить токен использованным (защита от replay)
    user.hashed_password = hash_password(data.new_password)
    prt.used = True
    await session.commit()

    # Force re-login на всех устройствах — RT выданные до смены пароля недействительны
    await revoke_all_user_tokens(user_id=user.id, session=session)

    return JSONResponse({"message": "Password updated successfully."})
