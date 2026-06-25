# Auth Refactoring — Tech Spec

**Ветка:** `auth-refactoring`
**Дата:** 2026-06-25
**Статус:** In Progress

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
```

Каждый коммит независимо деплоится и проходит CI.

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

### 5a. Модель + миграция

**Новый файл `app/models/password_reset_token.py`:**

```python
class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    token: Mapped[str] = mapped_column(String(128), unique=True, index=True, nullable=False)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
```

**Новая миграция `0011_create_password_reset_tokens_table.py`:**
- `down_revision = "0010"`
- Создаёт таблицу + уникальный индекс на `token`

**Обновление `alembic/env.py`:**
```python
from app.models.password_reset_token import PasswordResetToken  # noqa: F401
```

### 5b. Backend — email-сервис, утилиты, эндпоинты

**Email-провайдер: Resend (`pip install resend`)**
- Бесплатный план: 3000 писем/мес, 100/день
- REST API, отличный deliverability без сложной SMTP-конфигурации

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
import resend
from app.config import settings
from app.interfaces.email_service import IEmailService

class ResendEmailService(IEmailService):
    async def send_password_reset_email(self, to_email: str, reset_url: str) -> None:
        resend.api_key = settings.RESEND_API_KEY
        resend.Emails.send({
            "from": settings.FROM_EMAIL,
            "to": to_email,
            "subject": "Scopus Search — password reset",
            "html": f'<p>Reset link (valid 1 hour): <a href="{reset_url}">{reset_url}</a></p>',
        })
```

`app/core/password_reset_utils.py`:
```python
PASSWORD_RESET_EXPIRE_SECONDS = 3600  # 1 час

async def create_password_reset_token(user_id: int, session: AsyncSession) -> str: ...
async def get_valid_reset_token(token: str, session: AsyncSession) -> PasswordResetToken | None: ...
async def consume_reset_token(token: str, session: AsyncSession) -> None: ...  # used=True
```

**Обновления существующих файлов:**

`app/config.py` — добавить:
```python
RESEND_API_KEY: str = ""
FROM_EMAIL: str = "noreply@example.com"
```

`app/routers/auth.py` — 2 новых эндпоинта:
```
POST /auth/password-reset          — запрос сброса (заменяет stub в users.py)
POST /auth/password-reset/confirm  — подтверждение нового пароля
```

Безопасность `/auth/password-reset`:
- Всегда возвращает 200 с одинаковым сообщением (не раскрывает наличие аккаунта)
- Ссылка в письме: `${FRONTEND_URL}/reset-password?token=<value>`

Безопасность `/auth/password-reset/confirm`:
- Валидирует token: существует + not used + not expired
- Проверяет сложность нового пароля (те же правила, что при регистрации)
- После смены пароля: отзывает все RT пользователя (force re-login везде)
- `consume_reset_token()` → `used=True`

`app/schemas/user_schemas.py` — новая схема:
```python
class PasswordResetConfirmRequest(BaseModel):
    token: str
    new_password: str = Field(min_length=8, max_length=255)
    # + тот же field_validator password_strength
```

`app/routers/users.py` — удалить endpoint `POST /users/password-reset-request` (заглушка, реальный в `/auth/password-reset`).

`app/core/dependencies.py` — добавить:
```python
def get_email_service() -> IEmailService:
    return ResendEmailService()
```

**Тесты `tests/integration/test_password_reset.py`:**
- Запрос с несуществующим email → 200 (тот же ответ)
- Запрос с существующим email → 200 + токен создан в БД (email-сервис мокнут)
- Confirm с невалидным token → 422
- Confirm с истёкшим token → 401
- Confirm с already-used token → 401
- Успешный confirm → пароль изменён + все RT отозваны
- После confirm: старый пароль не работает на `POST /users/login`

### 5c. Frontend — страницы сброса пароля

**Новые файлы:**

`frontend/src/pages/ForgotPasswordPage.tsx`:
- Форма: одно поле email + кнопка
- Submit → `POST /auth/password-reset` → всегда показывает success message (не раскрывает наличие аккаунта)

`frontend/src/pages/ResetPasswordPage.tsx`:
- Читает `?token` из URL через `useSearchParams`
- Форма: new password + confirm password (Zod-валидация, те же правила)
- Submit → `POST /auth/password-reset/confirm`
- Success → navigate `/auth` + toast "Password updated. Please sign in."
- Error (invalid/expired token) → error message + ссылка "Request a new reset link"

**Обновления существующих файлов:**

`frontend/src/pages/AuthPage.tsx` — в `SignInForm` под полем пароля:
```tsx
<Link to="/forgot-password" className="text-xs text-blue-600 ...">
  Forgot password?
</Link>
```

`frontend/src/App.tsx` — два новых публичных маршрута:
```typescript
{ path: 'forgot-password', element: ForgotPasswordPage }
{ path: 'reset-password',  element: ResetPasswordPage }
```

`frontend/src/api/auth.ts` — два новых вызова:
```typescript
export async function requestPasswordReset(email: string): Promise<void>
export async function confirmPasswordReset(token: string, newPassword: string): Promise<void>
```

**Тесты фронтенда:**
- `ForgotPasswordPage.test.tsx`: submit → success message; сетевая ошибка → error message
- `ResetPasswordPage.test.tsx`: невалидный token → error; success → navigate `/auth`

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
