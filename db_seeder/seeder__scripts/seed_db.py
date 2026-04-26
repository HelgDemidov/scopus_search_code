# db_seeder/seeder__scripts/seed_db.py
import os
import asyncio
import httpx
from colorama import Fore, Style, init

# Импорт генератора ключевых фраз и функции выбора кластера
from keyword_generator import generate_keywords, get_todays_cluster

init(autoreset=True)

# ================== КОНСТАНТЫ ==================
# BASE_URL читается из окружения — фолбэк на production для обратной совместимости
# При запуске сидера для staging передается через SEEDER_BASE_URL в seeder.yml
BASE_URL = os.environ.get("SEEDER_BASE_URL", "https://scopus-search-code.up.railway.app")
ARTICLES_PER_QUERY = 25  # Максимум статей за 1 запрос к Scopus
DELAY_BETWEEN_REQUESTS = 2.0  # Секунд между запросами — защита от DDoS Railway и Scopus
RATE_LIMIT_STOP_THRESHOLD = 500  # Остановиться, если Scopus осталось < 500 запросов
# Берём все уникальные фразы от модели: фильтрация теперь cluster-scoped,
# поэтому отсев минимален и cap в 100 уже не нужен
KEYWORDS_TO_USE = 120


def _get_secrets() -> tuple[str, str]:
    # Читаем секреты через os.environ[] — fail-fast: KeyError если переменная не задана
    # SEEDER_EMAIL и SEEDER_PASSWORD удалены: JWT-логин заменен на статичный SEEDER_SECRET
    return (
        os.environ["DATABASE_URL"],
        os.environ["SEEDER_SECRET"],
    )


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
    db_url, seeder_secret = _get_secrets()
    openrouter_key = os.environ["OPENROUTER_API_KEY"]

    async with httpx.AsyncClient(timeout=30.0) as client:

        # Заголовки для вызова POST /seeder/seed — статичный секрет вместо JWT
        # Секрет не истекает, блок повторного логина не нужен
        headers = {
            "X-Seeder-Secret": seeder_secret,
            "Accept": "application/json",
        }

        # Шаг 1: кластер определяем ДО загрузки истории — нужен для фильтрации used_keywords
        cluster = get_todays_cluster()
        print(f"Кластер этого запуска: {Fore.YELLOW}{cluster}{Style.RESET_ALL}")

        # Шаг 2: загрузка истории использованных фраз из Supabase
        print(f"{Fore.CYAN}Читаем историю из Supabase...")
        all_keywords, cluster_map = await _fetch_used_keywords(db_url)
        print(f"Сохранено фраз в базе (все кластеры): {len(all_keywords)}")

        # Фильтруем: передаём в генератор только фразы активного кластера
        # Это кардинально снижает постфактумный отсев в generate_keywords
        cluster_keywords = [kw for kw, cl in cluster_map.items() if cl == cluster]
        print(f"Фраз активного кластера '{cluster}': {len(cluster_keywords)}\n")

        # Шаг 3: генерация фраз через OpenRouter — передаём кластер явно
        print(f"{Fore.CYAN}Генерируем ключевые фразы через OpenRouter...")
        all_new_keywords = await generate_keywords(
            cluster_keywords=cluster_keywords,
            api_key=openrouter_key,
            cluster=cluster,
        )
        keywords = all_new_keywords[:KEYWORDS_TO_USE]
        print(f"Уникальных новых фраз получено: {len(keywords)}\n")

        for i, keyword in enumerate(keywords, 1):
            print(
                f"[{i}/{len(keywords)}] {Fore.YELLOW}'{keyword}'{Style.RESET_ALL}...",
                end=" "
            )

            try:
                # POST /seeder/seed: Scopus-запрос и сохранение в catalog_articles
                # выполняются атомарно внутри приложения через CatalogService.seed()
                response = await client.post(
                    f"{BASE_URL}/seeder/seed",
                    headers=headers,
                    params={"keyword": keyword, "count": ARTICLES_PER_QUERY},
                )

                if response.status_code != 200:
                    print(f"{Fore.RED}Ошибка {response.status_code}: {response.text[:100]}")
                    continue

                # Ответ: {"keyword": "...", "saved": N, "rate_remaining": "..."}
                data = response.json()
                articles_found = data.get("saved", 0)
                print(f"{Fore.GREEN}Сохранено в каталог: {articles_found} шт.")

                # rate_remaining теперь приходит в теле ответа (пробрасывается из ScopusHTTPClient)
                rate_remaining = data.get("rate_remaining")
                if rate_remaining is not None and int(rate_remaining) < RATE_LIMIT_STOP_THRESHOLD:
                    print(
                        f"\n{Fore.RED}Алерт! Остаток лимита Scopus: {rate_remaining} запросов. "
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
