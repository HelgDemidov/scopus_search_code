# openalex_pdf_feed/run.py
"""Оркестрация: discovery -> dedup -> content-download -> storage -> Zotero.

Запускается как standalone-скрипт (python run.py) — из GitHub Actions
(.github/workflows/openalex-pdf-feed.yml) либо локально. По образцу
db_seeder/seeder__scripts/seed_db.py: секреты из os.environ (fail-fast),
colorama-прогресс, per-item try/except не роняет весь прогон.
"""

import asyncio
import os
from datetime import date, timedelta
from pathlib import Path

import httpx
import yaml
from colorama import Fore, Style, init

from openalex_pdf_feed.openalex_client import OpenAlexClient, OpenAlexError, work_short_id
from openalex_pdf_feed.storage import R2Storage
from openalex_pdf_feed.zotero_export import build_library

init(autoreset=True)

TERMS_FILE = Path(__file__).parent / "terms.yaml"
CURSOR_BUFFER_DAYS = 3  # запас под позднее индексирование OpenAlex (см. спеку §3)
CONTENT_DOWNLOAD_MIN_USD = 0.02  # $0.01/PDF + запас на пару discovery-вызовов в том же дне


def _get_config() -> dict[str, str]:
    # os.environ[] — fail-fast: KeyError, если переменная не задана
    return {
        "openalex_api_key": os.environ["OPENALEX_API_KEY"],
        "r2_bucket": os.environ["R2_BUCKET"],
        "r2_endpoint": os.environ["R2_ENDPOINT"],
        "r2_access_key_id": os.environ["R2_ACCESS_KEY_ID"],
        "r2_secret_access_key": os.environ["R2_SECRET_ACCESS_KEY"],
    }


def _load_terms() -> dict[str, list[str]]:
    with TERMS_FILE.open(encoding="utf-8") as f:
        clusters = yaml.safe_load(f)
    if not clusters:
        raise ValueError(f"{TERMS_FILE} пуст или не найден — нечего искать")
    return clusters


def _select_todays_cluster(clusters: dict[str, list[str]], today: date | None = None) -> str:
    """Детерминированная ротация: ровно один кластер в сутки.

    Раньше все кластеры/фразы шли одним списком каждый день — суточный бюджет
    OpenAlex стабильно упирался в последнюю фразу (medical anthropology),
    курсор не продвигался НИ РАЗУ за 12 дней подряд (см. память
    project-openalex-pdf-feed, 2026-08-14). При ротации по одному кластеру в
    день у каждого кластера свой курсор (storage.read_cursor/write_cursor) —
    кластер, обработанный сегодня целиком, продвигает СВОЙ курсор независимо
    от того, дошла ли очередь до второго.

    `today` — параметр, не date.today() внутри: тестируется без monkeypatch.
    Порядок кластеров — порядок ключей в terms.yaml (Python dict/YAML mapping
    сохраняют порядок вставки), стабилен между прогонами.
    """
    names = list(clusters)
    slot = (today or date.today()).toordinal() % len(names)
    return names[slot]


async def run() -> None:
    print(f"{Fore.CYAN}===== OpenAlex PDF Feed запущен =====")

    config = _get_config()
    clusters = _load_terms()
    cluster = _select_todays_cluster(clusters)
    terms = clusters[cluster]
    total_terms = sum(len(v) for v in clusters.values())
    print(f"Кластер сегодня: {Fore.YELLOW}{cluster}{Style.RESET_ALL} ({len(terms)} фраз из {total_terms} всего)")

    storage = R2Storage(
        bucket=config["r2_bucket"],
        endpoint_url=config["r2_endpoint"],
        access_key_id=config["r2_access_key_id"],
        secret_access_key=config["r2_secret_access_key"],
    )

    stored_cursor = await storage.read_cursor(cluster)
    since = stored_cursor - timedelta(days=CURSOR_BUFFER_DAYS) if stored_cursor else None
    print(f"Курсор кластера: {since if since else 'нет (первый прогон — полная история)'}")

    stats = {"found": 0, "downloaded": 0, "skipped_dedup": 0, "failed": 0, "no_pdf_cache": 0}
    budget_exhausted = False

    async with httpx.AsyncClient(timeout=60.0) as http_client:
        client = OpenAlexClient(http_client, api_key=config["openalex_api_key"])

        for term in terms:
            if budget_exhausted:
                break
            print(f"\n{Fore.CYAN}── Фраза: '{term}' ──")

            # Метрика "сколько совпадений без кэша PDF" (has_content.pdf:false)
            # — не скачивается в MVP, только считается как задел под Phase 2
            # (CORE.ac.uk fallback, см. спеку §1 «Вне скоупа»)
            try:
                total_any = await client.count(term, since, require_content_pdf=False)
                total_with_pdf = await client.count(term, since, require_content_pdf=True)
                stats["no_pdf_cache"] += total_any - total_with_pdf
            except OpenAlexError as e:
                print(f"{Fore.RED}  count() не удался: {e}")

            async for work in client.discover(term, since=since):
                stats["found"] += 1
                work_id = work_short_id(work)

                if await storage.paper_exists(work_id):
                    stats["skipped_dedup"] += 1
                    continue

                if not client.has_budget(CONTENT_DOWNLOAD_MIN_USD):
                    print(f"{Fore.YELLOW}Дневной бюджет OpenAlex исчерпан — останавливаемся раньше.")
                    budget_exhausted = True
                    break

                try:
                    pdf_bytes = await client.download_content(work_id)
                    await storage.upload_paper(work_id, pdf_bytes, work)
                    stats["downloaded"] += 1
                    print(f"{Fore.GREEN}  {work_id}: скачано")
                except OpenAlexError as e:
                    stats["failed"] += 1
                    print(f"{Fore.RED}  {work_id}: ошибка OpenAlex — {e}")
                except httpx.RequestError as e:
                    stats["failed"] += 1
                    print(f"{Fore.RED}  {work_id}: сетевая ошибка — {e}")

        print(f"\n{Fore.CYAN}── Пересборка Zotero-библиотеки ──")
        all_metadata = await storage.list_paper_metadata()
        library = build_library(all_metadata)
        await storage.upload_zotero_library(library)
        print(f"{Fore.GREEN}zotero/library.json: {len(library)} записей")

        if not budget_exhausted:
            await storage.write_cursor(cluster, date.today())
            print(f"{Fore.GREEN}Курсор кластера '{cluster}' обновлён: {date.today()}")
        else:
            print(
                f"{Fore.YELLOW}Курсор кластера '{cluster}' НЕ обновлён — прогон прерван "
                f"по бюджету, доберём в следующий раз (свои курсоры остальных кластеров не затронуты)"
            )

    print(
        f"\n{Fore.CYAN}===== Готово: найдено {stats['found']}, "
        f"скачано {stats['downloaded']}, "
        f"уже было {stats['skipped_dedup']}, "
        f"без кэша PDF {stats['no_pdf_cache']}, "
        f"ошибок {stats['failed']} ====={Style.RESET_ALL}"
    )


if __name__ == "__main__":
    asyncio.run(run())
