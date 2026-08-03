# openalex_pdf_feed/storage.py
"""Слой хранения R2: HEAD-дедуп, upload PDF+JSON sidecar, курсор.

Бакет — источник истины для идемпотентности (см. спеку §3): GitHub Actions
runner эфемерен, поэтому вместо отдельного манифеста используется
HEAD-проверка существования объекта в самом бакете, а не локальная БД.

boto3 синхронный — блокирующие вызовы оборачиваются в asyncio.to_thread,
чтобы не блокировать event loop, которым владеет OpenAlexClient
(httpx.AsyncClient).
"""

import asyncio
import json
from datetime import date

import boto3
from botocore.exceptions import ClientError

PAPERS_PREFIX = "papers"
ZOTERO_KEY = "zotero/library.json"
CURSOR_KEY = "_state/cursor.json"

_NOT_FOUND_CODES = ("404", "NoSuchKey")


class R2Storage:
    def __init__(self, bucket: str, endpoint_url: str, access_key_id: str, secret_access_key: str):
        self._bucket = bucket
        self._s3 = boto3.client(
            "s3",
            endpoint_url=endpoint_url,
            aws_access_key_id=access_key_id,
            aws_secret_access_key=secret_access_key,
            region_name="auto",
        )

    async def paper_exists(self, openalex_id: str) -> bool:
        return await asyncio.to_thread(self._exists_sync, f"{PAPERS_PREFIX}/{openalex_id}.pdf")

    def _exists_sync(self, key: str) -> bool:
        try:
            self._s3.head_object(Bucket=self._bucket, Key=key)
            return True
        except ClientError as e:
            if e.response.get("Error", {}).get("Code") in _NOT_FOUND_CODES:
                return False
            raise

    async def upload_paper(self, openalex_id: str, pdf_bytes: bytes, metadata: dict) -> None:
        await asyncio.to_thread(
            self._s3.put_object,
            Bucket=self._bucket,
            Key=f"{PAPERS_PREFIX}/{openalex_id}.pdf",
            Body=pdf_bytes,
            ContentType="application/pdf",
        )
        await asyncio.to_thread(
            self._s3.put_object,
            Bucket=self._bucket,
            Key=f"{PAPERS_PREFIX}/{openalex_id}.json",
            Body=json.dumps(metadata, ensure_ascii=False, indent=2).encode("utf-8"),
            ContentType="application/json",
        )

    async def list_paper_metadata(self) -> list[dict]:
        """Читает все papers/*.json — источник для полной пересборки Zotero-экспорта."""
        keys = await asyncio.to_thread(self._list_json_keys_sync)
        results = []
        for key in keys:
            body = await asyncio.to_thread(self._get_object_sync, key)
            results.append(json.loads(body))
        return results

    def _list_json_keys_sync(self) -> list[str]:
        keys = []
        paginator = self._s3.get_paginator("list_objects_v2")
        for page in paginator.paginate(Bucket=self._bucket, Prefix=f"{PAPERS_PREFIX}/"):
            for obj in page.get("Contents", []):
                if obj["Key"].endswith(".json"):
                    keys.append(obj["Key"])
        return keys

    def _get_object_sync(self, key: str) -> bytes:
        response = self._s3.get_object(Bucket=self._bucket, Key=key)
        return response["Body"].read()  # type: ignore[no-any-return]

    async def upload_zotero_library(self, csl_json_items: list[dict]) -> None:
        await asyncio.to_thread(
            self._s3.put_object,
            Bucket=self._bucket,
            Key=ZOTERO_KEY,
            Body=json.dumps(csl_json_items, ensure_ascii=False, indent=2).encode("utf-8"),
            ContentType="application/json",
        )

    async def read_cursor(self) -> date | None:
        """Дата предыдущего успешного прогона либо None при первом прогоне.
        Буфер '-3 дня' под позднее индексирование — забота вызывающего кода
        (run.py), не этого слоя: здесь только чистое хранение значения."""
        try:
            body = await asyncio.to_thread(self._get_object_sync, CURSOR_KEY)
        except ClientError as e:
            if e.response.get("Error", {}).get("Code") in _NOT_FOUND_CODES:
                return None
            raise
        data = json.loads(body)
        return date.fromisoformat(data["from_publication_date"])

    async def write_cursor(self, run_date: date) -> None:
        await asyncio.to_thread(
            self._s3.put_object,
            Bucket=self._bucket,
            Key=CURSOR_KEY,
            Body=json.dumps({"from_publication_date": run_date.isoformat()}, ensure_ascii=False).encode("utf-8"),
            ContentType="application/json",
        )
