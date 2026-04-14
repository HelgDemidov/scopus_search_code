import os
import asyncio
import httpx
from colorama import Fore, Style, init

# Импорт генератора ключевых фраз из соседнего модуля
from keyword_generator import generate_keywords

init(autoreset=True)

# ================== КОНСТАНТЫ ==================
BASE_URL = "https://scopus-search-code.up.railway.app"
ARTICLES_PER_QUERY = 25  # Максимум статей за 1 запрос к Scopus
DELAY_BETWEEN_REQUESTS = 2.0  # Секунд между запросами — защита от DDoS Railway и Scopus
RATE_LIMIT_STOP_THRESHOLD = 500  # Остановиться, если Scopus осталось < 500 запросов
KEYWORDS_TO_USE = 100  # Из 120 сгенерированных используем 100


def _get_secrets() -> tuple[str, str, str]:
    # Читаем секреты через os.environ[] — fail-fast: KeyError если переменная не задана
    return (
        os.environ["DATABASE_URL"],
        os.environ["SEEDER_EMAIL"],
        os.environ["SEEDER_PASSWORD"],
    )


async def _get_jwt_token(client: httpx.AsyncClient, email: str, password: str) -> str:
    # Автологин через эндпоинт FastAPI — пароль проходит bcrypt-верификацию на сервере
    response = await client.post(
        f"{BASE_URL}/users/login",
        data={"username": email, "password": password},  # OAuth2PasswordRequestForm ждет form-data
    )
    if response.status_code != 200:
        raise RuntimeError(f"Автологин не удался: {response.status_code} {response.text}")
    token = response.json().get("access_token")
    if not token:
        raise RuntimeError("В ответе /users/login нет поля access_token")
    print(f"{Fore.GREEN}Токен получен успешно.")
    return token


async def _fetch_used_keywords(db_url: str) -> tuple[list[str], dict[str, str]]:
    # statement_cache_size=0 — обязательно для Supabase Session Pooler (PgBouncer transaction mode)
    import asyncpg
    conn = await asyncpg.connect(
        db_url.replace("postgresql+asyncpg://", "postgresql://"),
        statement_cache_size=0,
    )
    try:
        rows = await conn.fetch("SELECT keyword, cluster FROM seeder_keywords ORDER BY used_at ASC")
        keywords = [row["keyword"] for row in rows]
        cluster_map = {row["keyword"]: row["cluster"] for row in rows}
        return keywords, cluster_map
    finally:
        await conn.close()


async def _save_keyword_result(
    db_url: str, keyword: str, cluster: str, articles_found: int
) -> None:
    # statement_cache_size=0 — обязательно для Supabase Session Pooler (PgBouncer transaction mode)
    import asyncpg
    conn = await asyncpg.connect(
        db_url.replace("postgresql+asyncpg://", "postgresql://"),
        statement_cache_size=0,
    )
    try:
        await conn.execute(
            """
            INSERT INTO seeder_keywords (keyword, cluster, articles_found, used_at)
            VALUES ($1, $2, $3, now())
            ON CONFLICT (keyword) DO UPDATE
                SET articles_found = EXCLUDED.articles_found,
                    used_at        = now()
            """,
            keyword, cluster, articles_found,
        )
    finally:
        await conn.close()


async def seed_database() -> None:
    print(f"{Fore.CYAN}===== Сидер Scopus запущен =====")
    print(f"BASE_URL: {BASE_URL}\n")

    # Читаем секреты через os.environ[] — KeyError = немедленный fail-fast
    db_url, email, password = _get_secrets()
    openrouter_key = os.environ["OPENROUTER_API_KEY"]

    async with httpx.AsyncClient(timeout=30.0) as client:

        # Шаг 1: автологин и получение JWT-токена
        token = await _get_jwt_token(client, email, password)

        # Шаг 2: загрузка истории использованных фраз из Supabase
        print(f"{Fore.CYAN}Читаем историю из Supabase...")
        used_keywords, _ = await _fetch_used_keywords(db_url)
        print(f"Сохранено фраз в базе: {len(used_keywords)}\n")

        # Шаг 3: генерация 120 фраз через OpenRouter, берем 100 уникальных
        print(f"{Fore.CYAN}Генерируем ключевые фразы через OpenRouter...")
        all_keywords, cluster = await generate_keywords(used_keywords, openrouter_key)
        keywords = all_keywords[:KEYWORDS_TO_USE]
        print(f"Кластер: {Fore.YELLOW}{cluster}{Style.RESET_ALL}")
        print(f"Фраз для обработки: {len(keywords)}\n")

        headers = {
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
        }

        for i, keyword in enumerate(keywords, 1):
            print(
                f"[{i}/{len(keywords)}] {Fore.YELLOW}'{keyword}'{Style.RESET_ALL}...",
                end=" "
            )

            try:
                response = await client.get(
                    f"{BASE_URL}/articles/find",
                    headers=headers,
                    params={"keyword": keyword, "count": ARTICLES_PER_QUERY},
                )

                # Токен протух — перелогиниваемся и повторяем запрос
                if response.status_code == 401:
                    print(f"{Fore.YELLOW}Токен протух, переполучаем...")
                    token = await _get_jwt_token(client, email, password)
                    headers["Authorization"] = f"Bearer {token}"
                    response = await client.get(
                        f"{BASE_URL}/articles/find",
                        headers=headers,
                        params={"keyword": keyword, "count": ARTICLES_PER_QUERY},
                    )

                if response.status_code != 200:
                    print(f"{Fore.RED}Ошибка {response.status_code}: {response.text[:100]}")
                    continue

                data = response.json()
                articles_found = len(data) if isinstance(data, list) else 0
                print(f"{Fore.GREEN}Сохранено: {articles_found} шт.")

                # Проверяем остаток лимита Scopus из заголовков ответа
                rate_remaining = response.headers.get("X-RateLimit-Remaining")
                if rate_remaining is not None and int(rate_remaining) < RATE_LIMIT_STOP_THRESHOLD:
                    print(
                        f"\n{Fore.RED}Aлерт! Остаток лимита Scopus: {rate_remaining} запросов. "
                        f"Останавливаемся."
                    )
                    await _save_keyword_result(db_url, keyword, cluster, articles_found)
                    break

                # Записываем результат запроса в seeder_keywords (INSERT OR UPDATE через ON CONFLICT)
                await _save_keyword_result(db_url, keyword, cluster, articles_found)

            except httpx.RequestError as e:
                print(f"{Fore.RED}Сетевая ошибка: {e}")
            except Exception as e:
                print(f"{Fore.RED}Непредвиденная ошибка: {e}")

            # Обязательная пауза — защита Railway и Scopus от перегрузки
            await asyncio.sleep(DELAY_BETWEEN_REQUESTS)

    print(f"\n{Fore.CYAN}===== Сидер завершен =====")


if __name__ == "__main__":
    asyncio.run(seed_database())
