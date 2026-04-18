# Adversarial-аудит фронтенда: диагностика и стратегии исправления
## 1. Критическая архитектурная проблема: `CORS allow_origins=["*"]` + `allow_credentials=True`
**Диагноз (корень большинства проблем с API).** В `app/main.py`  одновременно стоят:

```python
allow_origins=["*"],
allow_credentials=True,
```

Это **невалидная комбинация по спецификации CORS** (RFC 6454 + Fetch Living Standard). Браузер **обязан** отклонить такой ответ с ошибкой. Когда `allow_credentials=True`, `allow_origins` не может быть wildcard `"*"` — сервер должен возвращать конкретный origin. FastAPI/Starlette с такой конфигурацией либо не выставляет заголовок `Access-Control-Allow-Origin` вовсе, либо ставит `"*"`, что браузер блокирует для credentialed-запросов.

**Следствие:** Все запросы с `withCredentials` (в частности, `/auth/refresh` с RT cookie, а также любой запрос с `Authorization: Bearer`) **молча падают** с CORS-ошибкой ещё на уровне preflight. Это объясняет сразу проблемы 1, 2, 3, 4, 6, 7 одновременно.

**Исправление в `app/main.py`:**
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL],  # "https://scopus-search-code.vercel.app"
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```
`settings.FRONTEND_URL` уже правильно выставлен в Railway Dashboard .

***
## 2. Проблема 2: регистрация → "Server error. Please try again"
**Диагноз — несоответствие полей формы и схемы бэкенда.**

`UserRegisterRequest` в `app/schemas/user_schemas.py` ожидает поле `password_confirm` . Нужно проверить, что именно фронтенд отправляет в теле запроса. Судя по скриншоту, в форме есть "Confirm Password" — значит поле есть в UI. Однако ошибка "Server error" (не "Validation error") означает, что запрос долетел до бэкенда, но упал с `500 Internal Server Error`. Наиболее вероятная причина: **исключение в `UserService.register()`**, которое не является `ValueError`, поэтому не превращается в `409 Conflict`, а пробрасывается наверх как необработанное — FastAPI возвращает 500.

Вторая возможная причина: **Pydantic-валидатор `password_strength`** требует заглавную букву, строчную, цифру И спецсимвол . Если пользователь ввёл пароль без спецсимвола — Pydantic выбросит `ValidationError` (422), но фронтенд отображает его как "Server error" без разбора кода ответа.

**Исправление:**

1. В `app/routers/users.py` расширить `try/except` в `register()`:
```python
@router.post("/register", ...)
async def register(data: UserRegisterRequest, service: ...):
    try:
        user = await service.register(data)
        return user
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except Exception as e:
        # Логируем, возвращаем понятную 500
        raise HTTPException(status_code=500, detail="Registration failed")
```

2. На фронтенде в `AuthPage` обрабатывать статусы `422` и `409` отдельно — показывать конкретное сообщение из `error.response.data.detail`, а не общее "Server error".

***
## 3. Проблема 3: логин через форму — кнопка зависает
**Диагноз — неверный Content-Type при логине.**

Бэкенд `POST /users/login` использует `OAuth2PasswordRequestForm = Depends()` . Это FastAPI-форма, которая **ожидает** `Content-Type: application/x-www-form-urlencoded` с полями `username` и `password`. Однако `apiClient` в `client.ts` создан с глобальным заголовком `'Content-Type': 'application/json'` .

Если фронтенд отправляет JSON — FastAPI не может разобрать форму, возвращает `422 Unprocessable Entity`. Interceptor видит не 401, не обрабатывает его как refresh, а просто не resolve-ит промис корректно. UI зависает.

Дополнительная проблема: `OAuth2PasswordRequestForm` ожидает поле именно `username` (не `email`), а форма на UI судя по скриншоту использует поле `Email` .

**Исправление — два варианта:**

**Вариант A (рекомендуется):** Переписать `/users/login` на приём JSON:
```python
@router.post("/login")
async def login(data: UserLoginRequest, ...):
    at_token, user_id = await service.login(data.email, data.password)
    ...
```
`UserLoginRequest` уже определён в схемах  — он ждёт `email` + `password` как JSON.

**Вариант B:** На фронтенде отправлять `FormData` с полем `username = email`:
```ts
const form = new URLSearchParams();
form.append('username', email);
form.append('password', password);
await apiClient.post('/users/login', form, {
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
});
```

***
## 4. Проблема 1 и 4: поисковая строка не реагирует ни на главной, ни на /explore
**Диагноз — CORS + маршрутизация в `vercel.json`.**

`vercel.json`  содержит два rewrite-правила:
```json
{ "source": "/auth/google/:path*", "destination": "...railway.app/auth/google/:path*" },
{ "source": "/api/:path*",         "destination": "...railway.app/:path*" },
{ "source": "/(.*)",               "destination": "/index.html" }
```

Фронтенд (`apiClient`) строит URL как `VITE_API_BASE_URL + путь`. Если `VITE_API_BASE_URL = ""` (пустая строка) — запросы идут на `https://scopus-search-code.vercel.app/users/search`, `/articles/stats` и т.д. **без префикса `/api/`**.

Vercel видит `/users/search` → не совпадает с `/api/:path*` → rewrite не срабатывает → Vercel пробует отдать статику → не находит файл → отдаёт `index.html` (правило `/(.*)`). Фронтенд получает HTML вместо JSON, axios молча падает.

Если же `VITE_API_BASE_URL = "https://scopus-search-code.up.railway.app"` — тогда идёт прямой cross-origin запрос, и возвращается к проблеме №1 (CORS wildcard + credentials).

**Исправление — согласованная связка Vercel ↔ apiClient:**

Установить в Vercel Dashboard:
```
VITE_API_BASE_URL = /api
```

И убедиться, что `vercel.json` содержит:
```json
{ "source": "/api/:path*", "destination": "https://scopus-search-code.up.railway.app/:path*" }
```

Тогда `/api/articles/search?q=ai` → Vercel rewrite → `https://...railway.app/articles/search?q=ai`. Это same-origin прокси — CORS вообще не задействован, credentials в cookie передаются автоматически.

***
## 5. Проблема 7: `/profile` редиректит на `/auth` даже после входа через Google
**Диагноз — состояние гонки при hydration токена.**

В `App.tsx` :
```ts
useEffect(() => {
  const token = localStorage.getItem('access_token');
  if (token) {
    setToken(token);
    fetchUser();
  }
  fetchStats();
}, []);
```

`PrivateRoute` проверяет `isAuthenticated` из `authStore` синхронно при первом рендере. При первом рендере `token = null`, `isAuthenticated = false` — потому что `useEffect` ещё не успел выполниться (он запускается **после** рендера). `PrivateRoute` видит неаутентифицированное состояние и редиректит на `/auth`. После этого hydration наконец-то срабатывает, но пользователь уже переброшен.

**Исправление — инициализировать стор синхронно:**

В `authStore.ts` изменить начальное состояние:
```ts
// Читаем токен синхронно при создании стора — до первого рендера
const _initialToken = localStorage.getItem('access_token');

export const useAuthStore = create<AuthStore>((set) => ({
  token: _initialToken,
  isAuthenticated: !!_initialToken,
  user: null,
  ...
}));
```

Тогда `PrivateRoute` при первом рендере уже видит `isAuthenticated: true` и не редиректит. `fetchUser()` можно оставить в `App.tsx useEffect` — он всё равно нужен для загрузки профиля.

***
## 6. Проблема 6: `/explore` показывает нули — данные из Supabase не отображаются
**Диагноз — `getStats()` вызывает эндпоинт, который не существует или возвращает пустые данные.**

`statsStore.ts` вызывает `getStats()` из `api/stats.ts` . Нужно проверить, что именно возвращает бэкенд по `GET /articles/stats`. Если этот эндпоинт считает записи через ORM и возвращает `{"total": 0, ...}` — значит либо:

- ORM-запрос смотрит не в ту таблицу (мисматч имён таблиц)
- Seeder писал в Supabase напрямую через `psycopg2`/SQL, а ORM работает с другой схемой
- Строка подключения в Railway указывает на пустую БД (не ту, куда лил seeder)

Также проблема CORS из п.1 может привести к тому, что `fetchStats()` просто не получает ответ — стор остаётся в `stats: null`, UI отображает 0 везде.

**Исправление — три шага:**
1. Сначала устранить CORS (п.1) и маршрутизацию (п.4) — это снимет сетевой барьер
2. Проверить в Railway Logs, что `GET /articles/stats` действительно вызывается и возвращает не-нулевые данные
3. Убедиться, что в Railway Dashboard переменная `DATABASE_URL` указывает на ту же Supabase БД, куда писал seeder

***
## 7. Проблема 5: структура страниц vs. ТЗ
**Текущая реализация в `App.tsx`**  содержит следующие маршруты:

| Путь | Компонент | Статус по ТЗ §4 |
|---|---|---|
| `/` | `HomePage` | Реализована (§4.1) |
| `/explore` | `ExplorePage` | Реализована (§4.2), данные пусты |
| `/auth` | `AuthPage` | Реализована (§4.3) |
| `/auth/callback` | `OAuthCallback` | Реализована |
| `/profile` | `ProfilePage` (protected) | Недоступна из-за race condition |
| `/article/:id` | **отсутствует** | Не реализована (§4.5 по ТЗ) |
| `/search` | **отсутствует** | Возможно объединена с `/` |

**Итог:** страница деталей статьи (`/article/:id`) отсутствует в роутере. Если ТЗ §4.5 описывает отдельную страницу — это нереализованный функционал.

***
## Сводная таблица приоритетов исправлений
| # | Проблема | Корневая причина | Приоритет |
|---|---|---|---|
| 1 | CORS блокирует все credentialed-запросы | `allow_origins=["*"]` + `allow_credentials=True` | 🔴 Критично |
| 2 | Маршрутизация: API-запросы не достигают Railway | `VITE_API_BASE_URL=""` без `/api` префикса | 🔴 Критично |
| 3 | Race condition: `/profile` → редирект | Синхронный `PrivateRoute` vs асинхронный `useEffect` hydration | 🔴 Критично |
| 4 | Логин зависает | `OAuth2PasswordRequestForm` ожидает form-data, клиент шлёт JSON | 🟠 Высокий |
| 5 | Регистрация → Server error | Необработанные исключения в `register()` + строгий Pydantic-валидатор | 🟠 Высокий |
| 6 | `/explore` показывает нули | CORS + возможный мисматч БД | 🟡 После п.1-2 |
| 7 | `/article/:id` не реализована | Отсутствует маршрут и компонент | 🟡 Следующий этап |

**Рекомендуемый порядок исправлений:**
1. Исправить CORS в `app/main.py` (5 минут, один файл)
2. Выставить `VITE_API_BASE_URL=/api` в Vercel Dashboard и передеплоить
3. Исправить синхронную инициализацию `authStore.ts`
4. Переписать `/users/login` на JSON-body
5. Расширить обработку ошибок в `register()`
6. Проверить данные в `/articles/stats` через Railway Logs