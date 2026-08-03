# openalex_pdf_feed/mac_publish.py
"""Mac-side: человекочитаемые имена файлов вместо OpenAlex ID.

R2 остаётся ID-named (см. storage.py — на этом держится дедуп/идемпотентность,
трогать нельзя). Поэтому переименование происходит только локально на Mac, в
два шага (см. README, раздел "Синхронизация R2 → iCloud"):

1. `rclone sync` зеркалит R2 papers/ в СКРЫТУЮ staging-папку (ID-named,
   один в один как в бакете) — эта папка не в iCloud, девушка её не видит.
2. Этот скрипт публикует новые пары из staging в видимую iCloud-папку под
   человекочитаемым именем через copy, НЕ sync: если бы видимая папка сама
   была целью rclone sync, переименованные файлы удалялись бы на следующем
   прогоне как "лишние" (sync зеркалит источник, а источник остаётся
   ID-named) — copy аддитивен, ничего не удаляет.

Идемпотентность публикации — по суффиксу `__<id>` в имени файла в целевой
папке (glob-проверка), не по пересчёту слага: если логика слага когда-нибудь
изменится, уже опубликованные файлы не переименовываются задним числом —
новую схему получат только новые пары.

Только стандартная библиотека — Mac не нуждается в pip install (boto3/httpx/
pyyaml из run.py здесь не нужны), только checkout репозитория для импорта
пакета (`python3 -m openalex_pdf_feed.mac_publish`, запускать из корня репо).
"""

import argparse
import json
import shutil
from pathlib import Path
from typing import Any

from openalex_pdf_feed.text_utils import slugify, split_author_name


def _first_author_component(work: dict[str, Any]) -> str:
    authorships = work.get("authorships") or []
    if not authorships:
        return "unknown-author"
    display_name = (authorships[0].get("author") or {}).get("display_name")
    if not display_name:
        return "unknown-author"
    parts = split_author_name(display_name)
    return parts.get("family") or parts.get("literal") or "unknown-author"


def build_slug_filename(work: dict[str, Any], openalex_id: str) -> str:
    """<год>_<фамилия-первого-автора>_<слаг-заголовка>__<openalex_id> —
    id-суффикс гарантирует уникальность независимо от качества слага
    (два разных автора/год/title-prefix теоретически могут совпасть)."""
    year = work.get("publication_year")
    year_part = str(year) if year else "unknown-year"
    author_part = slugify(_first_author_component(work), max_len=30) or "unknown-author"
    title_part = slugify(work.get("title") or work.get("display_name") or "", max_len=60) or "untitled"
    return f"{year_part}_{author_part}_{title_part}__{openalex_id}"


def _already_published(dest_dir: Path, openalex_id: str) -> bool:
    return any(dest_dir.glob(f"*__{openalex_id}.pdf"))


def publish_new_papers(staging_dir: Path, dest_dir: Path) -> int:
    """Копирует ещё не опубликованные пары из staging в dest под
    человекочитаемым именем. Возвращает количество новых пар."""
    dest_dir.mkdir(parents=True, exist_ok=True)
    published = 0
    for json_path in sorted(staging_dir.glob("*.json")):
        openalex_id = json_path.stem
        pdf_path = staging_dir / f"{openalex_id}.pdf"
        if not pdf_path.exists():
            continue  # метаданные без PDF — неполная пара, не публикуем
        if _already_published(dest_dir, openalex_id):
            continue

        work = json.loads(json_path.read_text(encoding="utf-8"))
        slug = build_slug_filename(work, openalex_id)
        shutil.copy2(pdf_path, dest_dir / f"{slug}.pdf")
        shutil.copy2(json_path, dest_dir / f"{slug}.json")
        published += 1

    return published


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--staging", required=True, type=Path, help="ID-named зеркало R2 papers/ (rclone sync)")
    parser.add_argument("--dest", required=True, type=Path, help="видимая iCloud-папка, человекочитаемые имена")
    args = parser.parse_args()

    count = publish_new_papers(args.staging, args.dest)
    print(f"Опубликовано новых пар: {count}")


if __name__ == "__main__":
    main()
