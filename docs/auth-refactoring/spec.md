# Auth Refactoring — Tech Spec

**Ветка:** `auth-refactoring`
**Дата создания:** 2026-06-25
**Обновлено:** 2026-06-26
**Статус:** Commits 1–4 ✅ · Commit 5 — In Progress

---

## Контекст и мотивация

Система аутентификации проекта архитектурно грамотна (httpOnly RT cookie, RT-ротация, серверная инвалидация, CSRF-guard, Promise-синглтон для параллельных 401), однако накопила технический долг:

1. **AT хранится в `localStorage`** — незавершённый "Commit 3", прямо отмеченный в коде комментарием. XSS-атака может прочитать AT (30-минутное окно).
2. **Нет очистки устаревших RT-строк** — таблица `refresh_tokens` растёт неограниченно (каждый login/refresh добавляет строку, ничто не удаляет).
3. **Нет индекса на `refresh_tokens.user_id`** — «отозвать все RT пользователя» требует full scan.
4. **Дублирование cookie-констант** — `_RT_COOKIE_NAME`, `_RT_COOKIE_MAX_AGE` объявлены в `auth.py` и `users.py` независимо; рассинхронизация при изменении одного файла.
5. **`POST /users/password-reset-request` — заглушка** — не отправляет письмо, не генерирует токен.

**Не входит в scope:** переход на сессионные cookie (persistent-сессии — намеренный продуктовый выбор, аналог Gmail).

---

## Порядок коммитов

```
Commit 1  →  Commit 2  →  Commit 3  →  Commit 4  →  Commits 5a/5b/5c
[Task 4]     [Task 3]     [Task 2]     [Task 1]      [Task 5]
Cookie       DB index     RT cleanup   localStorage  Password
constants    migration    piggyback    removal       reset
(refactor)   (additive)  (additive)   (frontend)    (full feature)
   ✅            ✅           ✅           ✅            ⏳
```

Каждый коммит независимо деплоится и проходит CI.

---

## Промежуточные итоги (Commits 1–4, 2026-06-26)

### Выполнено

| Commit | Хеш | Результат |
|---|---|---|
| 1 — Cookie constants | `c5030d7` | `app/core/cookie_constants.py` создан; дублирование в `auth.py`/`users.py` устранено |
| 2 — DB index | `6974acd` | Миграция `0010`, `user_id` с `index=True` в модели; `alembic heads` = единственный head |
| 3 — RT cleanup | `e3dbc57` | `cleanup_stale_tokens()` в `refresh_token_utils.py`; piggyback-вызов в `/auth/refresh`; `test_rt_cleanup.py` (новый), `test_rt_e2e.py` обновлён |
| 4 — localStorage removal | `61b8f0c` | `tokenStore.ts` (новый); `authStore.ts`, `App.tsx`, `client.ts` очищены от localStorage |

### Метрики

- **Backend тесты:** 104 passed (SQLite, `not requires_pg`)
- **Frontend тесты:** 99 passed (87 unit + 12 integration)
- **TypeScript:** `tsc --noEmit` — чистый
- **Ruff:** все изменённые файлы без ошибок
- **CI триггеры:** `auth-refactoring` добавлен в `tests.yml` и `frontend-tests.yml`

### Ключевые архитектурные решения, зафиксированные в коде

- Persistent-сессии (30-дневный RT) **оставлены намеренно** — это продуктовый выбор, не баг
- Circular dep `client.ts ↔ authStore` разорван через изолированный `tokenStore.ts`
- Cleanup RT — piggyback pattern (без scheduler): дёшево, достаточно для данного масштаба
- `test_rt_e2e.py` шаг 8 обновлён: `rt_v1` теперь **удаляется** cleanup-ом (не просто `revoked=True`)

---

---

## Commit 1 — Cookie constants (Task 4)

**Цель:** единственный источник истины для имён и TTL cookie.

### Файлы

| Действие | Файл |
|---|---|
| NEW | `app/core/cookie_constants.py` |
| EDIT | `app/routers/auth.py` |
| EDIT | `app/routers/users.py` |

### `app/core/cookie_constants.py`

```python
RT_COOKIE_NAME: str = "refresh_token"
RT_COOKIE_MAX_AGE: int = 30 * 24 * 3600  # 30 дней

AT_HANDSHAKE_COOKIE_NAME: str = "auth_handshake"
AT_HANDSHAKE_MAX_AGE: int = 5 * 60        # 5 минут (только OAuth handshake)
```

### `app/routers/auth.py`

- Удалить: `_RT_COOKIE_NAME`, `_RT_COOKIE_MAX_AGE`, `_AT_HANDSHAKE_COOKIE`, `_AT_HANDSHAKE_MAX_AGE`
- Добавить импорт из `app.core.cookie_constants`
- Заменить все ссылки на импортированные имена

### `app/routers/users.py`

- Удалить: `_RT_COOKIE_NAME`, `_RT_COOKIE_MAX_AGE`
- Добавить импорт из `app.core.cookie_constants`
- Заменить все ссылки

**Тесты:** `test_rt_e2e.py` и `test_rt_edge_cases.py` проходят без изменений — поведение не меняется.

---

## Commit 2 — DB index on `refresh_tokens.user_id` (Task 3)

**Цель:** быстрый lookup при «отозвать все RT пользователя» (смена пароля, компрометация аккаунта).

### Файлы

| Действие | Файл |
|---|---|
| EDIT | `app/models/refresh_token.py` |
| NEW | `alembic/versions/0010_add_user_id_index_to_refresh_tokens.py` |

### Модель

```python
user_id: Mapped[int] = mapped_column(
    Integer, ForeignKey("users.id", ondelete="CASCADE"),
    nullable=False,
    index=True,  # добавить
)
```

### Миграция

```python
revision = "0010"
down_revision = "f9a3c1e2b7d4"  # последняя в цепочке на момент создания

def upgrade() -> None:
    op.create_index(
        "ix_refresh_tokens_user_id",
        "refresh_tokens",
        ["user_id"],
        unique=False,
    )

def downgrade() -> None:
    op.drop_index("ix_refresh_tokens_user_id", table_name="refresh_tokens")
```

**Тесты:** нет новых — чисто DDL-изменение.

---

## Commit 3 — RT piggyback cleanup (Task 2)

**Цель:** удалять устаревшие (истёкшие + отозванные) RT строки при каждой ротации без отдельного scheduler.

### Файлы

| Действие | Файл |
|---|---|
| EDIT | `app/core/refresh_token_utils.py` |
| EDIT | `app/routers/auth.py` |
| NEW | `tests/integration/test_rt_cleanup.py` |

### `app/core/refresh_token_utils.py` — новая функция

```python
from sqlalchemy import delete, or_

async def cleanup_stale_tokens(user_id: int, session: AsyncSession) -> None:
    """Удаляет истёкшие и отозванные RT пользователя.
    Вызывается попутно при ротации — piggyback cleanup без отдельного scheduler."""
    now = datetime.now(timezone.utc)
    await session.execute(
        delete(RefreshToken).where(
            RefreshToken.user_id == user_id,
            or_(
                RefreshToken.revoked.is_(True),
                RefreshToken.expires_at < now,
            ),
        )
    )
    await session.commit()
```

### `app/routers/auth.py` — endpoint `/auth/refresh`

После `new_rt_value = await create_refresh_token(...)`:
```python
await cleanup_stale_tokens(user_id=rt.user_id, session=session)
```

### `tests/integration/test_rt_cleanup.py`

Сценарий теста:
1. Login → seed 2 дополнительных истёкших RT для того же `user_id` напрямую в БД
2. Вызвать `POST /auth/refresh` → piggyback cleanup срабатывает
3. Проверить: expired RT-строки удалены из БД, валидный новый RT присутствует

---

## Commit 4 — Remove AT from localStorage (Task 1)

**Цель:** AT хранится только в памяти (Zustand state). XSS-атака перестаёт иметь доступ к AT.

**UX-эффект:** нулевой — `POST /auth/refresh` при старте страницы уже вызывается, RT cookie восстанавливает сессию.

### Ключевая проблема: циклическая зависимость

Прямой импорт `authStore` в `client.ts` создаёт цикл:
`client.ts → authStore → api/users → client.ts`

**Решение:** новый модуль `tokenStore.ts` без зависимостей.

### Файлы

| Действие | Файл |
|---|---|
| NEW | `frontend/src/stores/tokenStore.ts` |
| EDIT | `frontend/src/stores/authStore.ts` |
| EDIT | `frontend/src/App.tsx` |
| EDIT | `frontend/src/api/client.ts` |
| EDIT | `frontend/src/stores/authStore.test.ts` |

### `frontend/src/stores/tokenStore.ts`

```typescript
// Изолированный держатель токена: нет зависимостей → нет циклов.
// client.ts вызывает getToken(), authStore.ts — setTokenValue()/clearTokenValue().
let _token: string | null = null;

export const getToken       = (): string | null => _token;
export const setTokenValue  = (token: string): void => { _token = token; };
export const clearTokenValue = (): void => { _token = null; };
```

### `frontend/src/stores/authStore.ts`

```typescript
// Удалить:
const _initialToken = localStorage.getItem('access_token');

// Начальное состояние:
token: null,
isAuthenticated: false,

// setToken — убрать localStorage.setItem:
setToken: (token: string) => {
  setTokenValue(token);  // tokenStore
  set({ token, isAuthenticated: true });
},

// logout finally — убрать localStorage.removeItem:
finally {
  clearTokenValue();  // tokenStore
  set({ token: null, user: null, isAuthenticated: false });
}
```

### `frontend/src/App.tsx`

Удалить fast-path блок (строки 134–138):
```typescript
// УДАЛИТЬ весь блок:
const token = localStorage.getItem('access_token');
if (token) {
  setToken(token);
  fetchUser();
}
```
Гидрация — только через `POST /auth/refresh`.

### `frontend/src/api/client.ts` — request interceptor

```typescript
// БЫЛО:
const token = localStorage.getItem('access_token');

// СТАЛО:
import { getToken } from '../stores/tokenStore';
// ...
const token = getToken();
```

### `frontend/src/stores/authStore.test.ts`

- Тест `"пишет AT в localStorage"` → инвертировать: `"НЕ пишет AT в localStorage"`
- Logout-тесты: убрать `localStorage.setItem` из setup и `expect(localStorage.getItem(...)).toBeNull()` из assertions
- Добавить: проверку что `setToken` обновляет state стора

`App.integration.test.tsx` — не требует изменений (уже не тестирует localStorage, подтверждено комментарием в коде).

---

## Commits 5a/5b/5c — Password Reset (Task 5)

### Предварительный критический анализ (2026-06-26)

#### Выбор email-провайдера: aiosmtplib вместо Resend

Первоначально в плане был Resend. После анализа — **aiosmtplib**:

| Критерий | Resend SDK | aiosmtplib |
|---|---|---|
| Async-native | ❌ sync SDK (нужен `asyncio.to_thread`) | ✅ нативный async |
| Vendor lock-in | Высокий (проприетарный API) | Нет (любой SMTP) |
| Верификация домена | Обязательна для production | Не нужна |
| Зависимость | `resend` (~5 MB) | `aiosmtplib` (~20 KB) |
| Тестируемость | Мок через DI | Мок через DI |

`aiosmtplib` работает с Gmail (App Password), Mailgun SMTP relay, SendGrid SMTP relay — провайдер меняется только через env vars, код остаётся тем же. Интерфейс `IEmailService` обеспечивает возможность замены в любой момент.

#### Уточнения безопасности

- **Энтропия токена:** `secrets.token_urlsafe(32)` = 256 бит — достаточно
- **TTL:** 1 час — индустриальный стандарт (NIST SP 800-63B)
- **Не раскрывать email:** endpoint ВСЕГДА возвращает 200 с одним текстом
- **Одноразовость:** `used=True` после consume — реплей-атака невозможна
- **Отзыв сессий:** после смены пароля отзываем ВСЕ RT пользователя через `revoke_all_user_tokens()` (новая функция в `refresh_token_utils.py`)
- **Ссылка в письме:** `/reset-password?token=xxx` — параметр в query, не в path (не попадает в Access-Log сервера при referrer-leaking)
- **Rate limiting:** намеренно не реализуем — масштаб проекта не требует; естественный throttle — SMTP rate limit
- **Timing attacks:** не применимы на HTTP-уровне для данного масштаба
- **`PasswordInput`** в `ResetPasswordPage.tsx`: дублируем локально (не выносим в shared component — YAGNI)

#### Важные изменения vs первоначальный план

1. Email-провайдер: Resend → **aiosmtplib**
2. Добавлена функция `revoke_all_user_tokens(user_id)` в `refresh_token_utils.py` (не только `revoke_refresh_token` для одного токена)
3. Конфиг: `RESEND_API_KEY` → `SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASSWORD / FROM_EMAIL`
4. `app/schemas/user_schemas.py` → вынести `_password_strength_validator` в отдельную функцию для переиспользования в `PasswordResetConfirmRequest`
5. Тест: DI-мок `IEmailService` через `app.dependency_overrides`, не `pytest-mock`

---

### 5a. Модель + миграция

**Новый файл `app/models/password_reset_token.py`:**

```python
class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    # URL-safe токен; token_urlsafe(32) → 43 символа; 128 — запас
    token: Mapped[str] = mapped_column(String(128), unique=True, index=True, nullable=False)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
```

**Новая миграция `0011_create_password_reset_tokens_table.py`:**
- `down_revision = "0010_add_user_id_index_to_refresh_tokens"`
- Создаёт таблицу + уникальный индекс на `token` + non-unique индекс на `user_id`

**Обновление `alembic/env.py`:**
```python
from app.models.password_reset_token import PasswordResetToken  # noqa: F401
```

---

### 5b. Backend — email-сервис, утилиты, эндпоинты

**Новая зависимость:** `aiosmtplib` (добавить в `requirements.txt`)

**Новые файлы:**

`app/interfaces/email_service.py`:
```python
from abc import ABC, abstractmethod

class IEmailService(ABC):
    @abstractmethod
    async def send_password_reset_email(self, to_email: str, reset_url: str) -> None: ...
```

`app/infrastructure/email_service.py`:
```python
import aiosmtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from app.config import settings
from app.interfaces.email_service import IEmailService

class SMTPEmailService(IEmailService):
    async def send_password_reset_email(self, to_email: str, reset_url: str) -> None:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = "Scopus Search — password reset"
        msg["From"] = settings.FROM_EMAIL
        msg["To"] = to_email
        html = (
            f"<p>You requested a password reset.</p>"
            f"<p><a href='{reset_url}'>Reset your password</a> (valid 1 hour).</p>"
            f"<p>If you didn't request this, ignore this email.</p>"
        )
        msg.attach(MIMEText(html, "html"))
        await aiosmtplib.send(
            msg,
            hostname=settings.SMTP_HOST,
            port=settings.SMTP_PORT,
            username=settings.SMTP_USER,
            password=settings.SMTP_PASSWORD,
            start_tls=True,
        )
```

`app/core/password_reset_utils.py`:
```python
PASSWORD_RESET_EXPIRE_SECONDS = 3600  # 1 час (NIST SP 800-63B)

async def create_password_reset_token(user_id: int, session: AsyncSession) -> str:
    """Генерирует токен сброса пароля и сохраняет в БД."""
    # 256 бит энтропии — достаточно с большим запасом
    ...

async def get_valid_reset_token(token: str, session: AsyncSession) -> PasswordResetToken | None:
    """Возвращает токен, если существует, не истёк и не использован."""
    ...

async def consume_reset_token(token: str, session: AsyncSession) -> None:
    """Помечает токен как использованный — one-time use."""
    ...
```

**Добавить в `app/core/refresh_token_utils.py`:**
```python
async def revoke_all_user_tokens(user_id: int, session: AsyncSession) -> None:
    """Отзывает все RT пользователя — вызывается при смене пароля."""
    await session.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user_id, RefreshToken.revoked.is_(False))
        .values(revoked=True)
    )
    await session.commit()
```

**Обновления существующих файлов:**

`app/config.py` — добавить:
```python
SMTP_HOST: str = "smtp.gmail.com"   # или smtp.mailgun.org / smtp.sendgrid.net
SMTP_PORT: int = 587
SMTP_USER: str = ""
SMTP_PASSWORD: str = ""             # Gmail: App Password (не основной пароль)
FROM_EMAIL: str = ""
```

`app/routers/auth.py` — 2 новых эндпоинта:
```
POST /auth/password-reset          — запрос сброса
POST /auth/password-reset/confirm  — подтверждение нового пароля
```

Детали `/auth/password-reset`:
```python
@router.post("/password-reset")
async def request_password_reset(
    data: PasswordResetRequest,
    session: AsyncSession = Depends(get_db_session),
    email_svc: IEmailService = Depends(get_email_service),
) -> JSONResponse:
    user = await repo.get_by_email(data.email)
    if user:
        token = await create_password_reset_token(user.id, session)
        reset_url = f"{settings.FRONTEND_URL}/reset-password?token={token}"
        await email_svc.send_password_reset_email(user.email, reset_url)
    # Всегда 200 — не раскрываем наличие аккаунта
    return JSONResponse({"message": "If this email is registered, a reset link has been sent."})
```

Детали `/auth/password-reset/confirm`:
```python
@router.post("/password-reset/confirm")
async def confirm_password_reset(data: PasswordResetConfirmRequest, ...) -> JSONResponse:
    # 1. get_valid_reset_token() — 422 если нет/истёк/использован
    # 2. hash new_password; update user.hashed_password
    # 3. consume_reset_token() → used=True
    # 4. revoke_all_user_tokens(user_id) → force re-login везде
    return JSONResponse({"message": "Password updated successfully."})
```

`app/schemas/user_schemas.py` — рефакторинг:
```python
# Выделить валидатор в переиспользуемую функцию:
def _validate_password_strength(v: str) -> str:
    # ... та же логика, что сейчас в UserRegisterRequest
    return v

class UserRegisterRequest(BaseModel):
    password: str = Field(...)
    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        return _validate_password_strength(v)

class PasswordResetConfirmRequest(BaseModel):
    token: str
    new_password: str = Field(min_length=8, max_length=255)
    @field_validator("new_password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        return _validate_password_strength(v)
```

`app/routers/users.py` — удалить:
```python
# УДАЛИТЬ целиком — заглушка заменена реальным /auth/password-reset
@router.post("/password-reset-request", status_code=HTTP_200_OK)
async def password_reset_request(...): ...
```
Также удалить `PasswordResetRequest` из импортов `users.py` (остаётся нужен `auth.py`).

`app/core/dependencies.py` — добавить:
```python
from app.interfaces.email_service import IEmailService
from app.infrastructure.email_service import SMTPEmailService

def get_email_service() -> IEmailService:
    return SMTPEmailService()
```

**Тесты `tests/integration/test_password_reset.py`:**

Все тесты переопределяют email-сервис через DI (не SMTP не вызывается):
```python
class _NoOpEmailService(IEmailService):
    async def send_password_reset_email(self, to_email: str, reset_url: str) -> None:
        pass

# В фикстуре client:
app.dependency_overrides[get_email_service] = lambda: _NoOpEmailService()
```

Сценарии:
- `POST /auth/password-reset` — несуществующий email → 200 (тот же ответ)
- `POST /auth/password-reset` — существующий email → 200 + токен создан в БД
- `POST /auth/password-reset/confirm` — невалидный token → 422
- `POST /auth/password-reset/confirm` — истёкший token → 422
- `POST /auth/password-reset/confirm` — already-used token → 422
- Успешный confirm → пароль изменён + все RT revoked=True
- После confirm → `POST /users/login` со старым паролем → 401
- После confirm → `POST /users/login` с новым паролем → 200

---

### 5c. Frontend — страницы сброса пароля

**Новые файлы:**

`frontend/src/pages/ForgotPasswordPage.tsx`:
- Форма: email + кнопка "Send reset link"
- Submit → `POST /auth/password-reset`
- После submit (успех или нет): показываем одно и то же сообщение "Check your email"
- Ошибка сети → отдельный error state

`frontend/src/pages/ResetPasswordPage.tsx`:
- Проверяет наличие `?token` в URL через `useSearchParams`; если нет → redirect `/forgot-password`
- Форма: new password + confirm password (Zod, те же правила что при регистрации)
- `PasswordInput` с show/hide — дублируем локально (не выносим в shared component — YAGNI)
- Submit → `POST /auth/password-reset/confirm`
- Success → navigate `/auth` + `toast.success("Password updated. Please sign in.")`
- 422/expired → inline error + ссылка "Request a new link"

**Обновления существующих файлов:**

`frontend/src/pages/AuthPage.tsx` — в `SignInForm` под полем пароля:
```tsx
<div className="text-right">
  <Link to="/forgot-password"
    className="text-xs text-slate-500 hover:text-blue-600 dark:hover:text-blue-400">
    Forgot password?
  </Link>
</div>
```

`frontend/src/App.tsx` — два публичных маршрута (не через PrivateRoute):
```typescript
{ path: 'forgot-password', element: lazyPage(() => import('./pages/ForgotPasswordPage')) }
{ path: 'reset-password',  element: lazyPage(() => import('./pages/ResetPasswordPage')) }
```

`frontend/src/api/auth.ts` — добавить:
```typescript
export async function requestPasswordReset(email: string): Promise<void> {
  await apiClient.post('/auth/password-reset', { email });
}

export async function confirmPasswordReset(token: string, newPassword: string): Promise<void> {
  await apiClient.post('/auth/password-reset/confirm', { token, new_password: newPassword });
}
```

**Тесты фронтенда:**

`ForgotPasswordPage.test.tsx`:
- Submit → success message отображается (мок `requestPasswordReset`)
- Сетевая ошибка → error state

`ResetPasswordPage.test.tsx`:
- Нет `?token` в URL → redirect на `/forgot-password`
- Submit с валидным токеном → `confirmPasswordReset` вызван → navigate `/auth`
- Сервер возвращает 422 → error message отображается

---

## Итоговая таблица изменённых файлов

| Задача | Backend (new/edit) | Frontend (new/edit) | Миграция | Тесты (new/update) |
|---|---|---|---|---|
| **Commit 1** Cookie constants | `core/cookie_constants.py` (N), `routers/auth.py` (E), `routers/users.py` (E) | — | — | existing pass |
| **Commit 2** DB index | `models/refresh_token.py` (E) | — | `0010_...` (N) | — |
| **Commit 3** RT cleanup | `core/refresh_token_utils.py` (E), `routers/auth.py` (E) | — | — | `test_rt_cleanup.py` (N) |
| **Commit 4** localStorage | — | `stores/tokenStore.ts` (N), `stores/authStore.ts` (E), `App.tsx` (E), `api/client.ts` (E) | — | `authStore.test.ts` (U) |
| **Commit 5a** PW reset model | `models/password_reset_token.py` (N), `alembic/env.py` (E) | — | `0011_...` (N) | — |
| **Commit 5b** PW reset backend | `interfaces/email_service.py` (N), `infrastructure/email_service.py` (N), `core/password_reset_utils.py` (N), `core/dependencies.py` (E), `routers/auth.py` (E), `routers/users.py` (E), `schemas/user_schemas.py` (E), `config.py` (E) | — | — | `test_password_reset.py` (N) |
| **Commit 5c** PW reset frontend | — | `ForgotPasswordPage.tsx` (N), `ResetPasswordPage.tsx` (N), `AuthPage.tsx` (E), `App.tsx` (E), `api/auth.ts` (E) | — | `ForgotPasswordPage.test.tsx` (N), `ResetPasswordPage.test.tsx` (N) |
