# db_seeder/seeder__scripts/seed_db.py
import asyncio
import os

import httpx
from colorama import Fore, Style, init

from keyword_generator import generate_keywords, get_todays_cluster

init(autoreset=True)

# ================== КОНСТАНТЫ ==================
BASE_URL = os.environ.get("SEEDER_BASE_URL", "https://scopus-search-code.up.railway.app")
ARTICLES_PER_QUERY = 25       # Жёсткий кап Scopus free API
DELAY_BETWEEN_REQUESTS = 2.0  # Секунд между запросами — защита Railway и Scopus от перегрузки
RATE_LIMIT_STOP_THRESHOLD = 500  # Остановиться, если Scopus осталось < 500 запросов

KEYWORDS_TO_USE = 120   # Сколько кандидатов запрашиваем у LLM за один вызов
NEW_KW_BUDGET = 50      # Блок A: макс. новых фраз за прогон
REPAG_BUDGET = 188      # Блок B: макс. ре-пагинаций за прогон (итого ~238 Scopus-вызовов)
REPAG_OFFSET_CAP = 5000 # Scopus free: start >= 5000 возвращает ошибку


def _get_secrets() -> tuple[str, str]:
    # os.environ[] — fail-fast: KeyError если переменная не задана
    return (
        os.environ["DATABASE_URL"],
        os.environ["SEEDER_SECRET"],
    )


async def _open_db(db_url: str):
    """Открывает одно asyncpg-соединение для всего прогона.

    statement_cache_size=0 обязателен для Supabase Session Pooler (PgBouncer transaction mode).
    """
    import asyncpg
    return await asyncpg.connect(
        db_url.replace("postgresql+asyncpg://", "postgresql://"),
        statement_cache_size=0,
    )


async def _fetch_used_keywords(conn) -> tuple[list[str], dict[str, str]]:
    rows = await conn.fetch("SELECT keyword, cluster FROM seeder_keywords ORDER BY used_at ASC")
    keywords = [row["keyword"] for row in rows]
    cluster_map = {row["keyword"]: row["cluster"] for row in rows}
    return keywords, cluster_map


async def _fetch_repag_keywords(conn, limit: int) -> list[dict]:
    """Кандидаты для ре-пагинации: last_offset < REPAG_OFFSET_CAP, сначала наименьший offset."""
    rows = await conn.fetch(
        """
        SELECT keyword, cluster, last_offset
        FROM seeder_keywords
        WHERE last_offset < $1
        ORDER BY last_offset ASC, used_at ASC
        LIMIT $2
        """,
        REPAG_OFFSET_CAP,
        limit,
    )
    return [dict(r) for r in rows]


async def _save_keyword_result(
    conn, keyword: str, cluster: str, articles_found: int, next_offset: int
) -> None:
    await conn.execute(
        """
        INSERT INTO seeder_keywords (keyword, cluster, articles_found, used_at, last_offset)
        VALUES ($1, $2, $3, now(), $4)
        ON CONFLICT (keyword) DO UPDATE
            SET articles_found = seeder_keywords.articles_found + EXCLUDED.articles_found,
                used_at        = now(),
                last_offset    = EXCLUDED.last_offset
        """,
        keyword, cluster, articles_found, next_offset,
    )


async def _call_seed_endpoint(
    client: httpx.AsyncClient,
    headers: dict,
    keyword: str,
    start: int,
) -> tuple[int, str | None]:
    """POST /seeder/seed. Возвращает (saved, rate_remaining | None)."""
    response = await client.post(
        f"{BASE_URL}/seeder/seed",
        headers=headers,
        params={"keyword": keyword, "count": ARTICLES_PER_QUERY, "start": start},
    )
    if response.status_code != 200:
        print(f"{Fore.RED}Ошибка {response.status_code}: {response.text[:100]}")
        return 0, None
    data = response.json()
    return data.get("saved", 0), data.get("rate_remaining")


async def seed_database() -> None:
    print(f"{Fore.CYAN}===== Сидер Scopus запущен =====")
    print(f"BASE_URL: {BASE_URL}\n")

    db_url, seeder_secret = _get_secrets()
    openrouter_key = os.environ["OPENROUTER_API_KEY"]

    conn = await _open_db(db_url)
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            headers = {"X-Seeder-Secret": seeder_secret, "Accept": "application/json"}

            # Шаг 1: кластер этого прогона
            cluster = get_todays_cluster()
            print(f"Кластер: {Fore.YELLOW}{cluster}{Style.RESET_ALL}")

            # Шаг 2: история из Supabase
            print(f"{Fore.CYAN}Читаем историю из Supabase...")
            all_keywords, cluster_map = await _fetch_used_keywords(conn)
            print(f"Фраз в базе (все кластеры): {len(all_keywords)}")

            cluster_keywords = [kw for kw, cl in cluster_map.items() if cl == cluster]
            print(f"Фраз активного кластера '{cluster}': {len(cluster_keywords)}")

            # Шаг 3: кандидаты Блока B — читаем ДО генерации новых (новые не попадут в список)
            repag_candidates = await _fetch_repag_keywords(conn, REPAG_BUDGET)
            print(f"Фраз для ре-пагинации (last_offset < {REPAG_OFFSET_CAP}): {len(repag_candidates)}\n")

            # Шаг 4: генерация новых фраз через OpenRouter
            print(f"{Fore.CYAN}Генерируем ключевые фразы через OpenRouter...")
            all_new_keywords = await generate_keywords(
                cluster_keywords=cluster_keywords,
                api_key=openrouter_key,
                cluster=cluster,
            )
            new_keywords = all_new_keywords[:NEW_KW_BUDGET]
            print(
                f"Новых фраз от LLM: {len(all_new_keywords)}, "
                f"к обработке в Блоке A: {len(new_keywords)}\n"
            )

            rate_limit_hit = False

            # ── Блок A: новые фразы (start=0) ──────────────────────────────
            if new_keywords:
                print(f"{Fore.CYAN}── Блок A: {len(new_keywords)} новых фраз ──")
            for i, keyword in enumerate(new_keywords, 1):
                print(
                    f"[A {i}/{len(new_keywords)}] {Fore.YELLOW}'{keyword}'{Style.RESET_ALL}...",
                    end=" ",
                )
                try:
                    saved, rate_remaining = await _call_seed_endpoint(
                        client, headers, keyword, start=0
                    )
                    print(f"{Fore.GREEN}сохранено: {saved} шт.")
                    await _save_keyword_result(conn, keyword, cluster, saved, next_offset=25)

                    if rate_remaining is not None and int(rate_remaining) < RATE_LIMIT_STOP_THRESHOLD:
                        print(
                            f"\n{Fore.RED}Алерт! Остаток Scopus: {rate_remaining}. Останавливаемся."
                        )
                        rate_limit_hit = True
                        break
                except httpx.RequestError as e:
                    print(f"{Fore.RED}Сетевая ошибка: {e}")
                except Exception as e:
                    print(f"{Fore.RED}Непредвиденная ошибка: {e}")
                await asyncio.sleep(DELAY_BETWEEN_REQUESTS)

            # ── Блок B: ре-пагинация ────────────────────────────────────────
            if not rate_limit_hit and repag_candidates:
                print(f"\n{Fore.CYAN}── Блок B: {len(repag_candidates)} фраз (ре-пагинация) ──")
            for i, kw_row in enumerate(repag_candidates, 1):
                if rate_limit_hit:
                    break
                keyword = kw_row["keyword"]
                kw_cluster = kw_row["cluster"]
                start = kw_row["last_offset"]
                next_offset = start + 25

                print(
                    f"[B {i}/{len(repag_candidates)}] {Fore.YELLOW}'{keyword}'{Style.RESET_ALL}"
                    f" (start={start})...",
                    end=" ",
                )
                try:
                    saved, rate_remaining = await _call_seed_endpoint(
                        client, headers, keyword, start=start
                    )
                    print(f"{Fore.GREEN}сохранено: {saved} шт. → next_offset={next_offset}")
                    await _save_keyword_result(
                        conn, keyword, kw_cluster, saved, next_offset=next_offset
                    )

                    if rate_remaining is not None and int(rate_remaining) < RATE_LIMIT_STOP_THRESHOLD:
                        print(
                            f"\n{Fore.RED}Алерт! Остаток Scopus: {rate_remaining}. Останавливаемся."
                        )
                        rate_limit_hit = True
                        break
                except httpx.RequestError as e:
                    print(f"{Fore.RED}Сетевая ошибка: {e}")
                except Exception as e:
                    print(f"{Fore.RED}Непредвиденная ошибка: {e}")
                await asyncio.sleep(DELAY_BETWEEN_REQUESTS)

    finally:
        await conn.close()

    print(f"\n{Fore.CYAN}===== Сидер завершен =====")


if __name__ == "__main__":
    asyncio.run(seed_database())
