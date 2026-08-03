# openalex_pdf_feed/tests/test_storage.py
import io
import json
from datetime import date

import pytest
from botocore.exceptions import ClientError

from openalex_pdf_feed.storage import CURSOR_KEY, R2Storage


class FakeS3Client:
    """In-memory двойник boto3 S3-клиента — по образцу FakeRedis в проекте
    (redis_client.py), чтобы не тянуть moto ради небольшого набора операций."""

    def __init__(self):
        self.objects: dict[str, bytes] = {}

    def head_object(self, Bucket, Key):
        if Key not in self.objects:
            raise ClientError({"Error": {"Code": "404", "Message": "Not Found"}}, "HeadObject")
        return {}

    def put_object(self, Bucket, Key, Body, ContentType=None):
        self.objects[Key] = Body if isinstance(Body, bytes) else Body.encode("utf-8")

    def get_object(self, Bucket, Key):
        if Key not in self.objects:
            raise ClientError({"Error": {"Code": "NoSuchKey", "Message": "Not Found"}}, "GetObject")
        return {"Body": io.BytesIO(self.objects[Key])}

    def get_paginator(self, operation_name):
        assert operation_name == "list_objects_v2"
        return _FakePaginator(self)


class _FakePaginator:
    def __init__(self, client: FakeS3Client):
        self._client = client

    def paginate(self, Bucket, Prefix=""):
        contents = [{"Key": key} for key in self._client.objects if key.startswith(Prefix)]
        yield {"Contents": contents}


def _storage(monkeypatch) -> tuple[R2Storage, FakeS3Client]:
    fake = FakeS3Client()
    monkeypatch.setattr("openalex_pdf_feed.storage.boto3.client", lambda *a, **kw: fake)
    storage = R2Storage(
        bucket="test-bucket",
        endpoint_url="https://example.r2.cloudflarestorage.com",
        access_key_id="k",
        secret_access_key="s",
    )
    return storage, fake


@pytest.mark.asyncio
async def test_paper_exists_false_when_absent(monkeypatch):
    storage, _fake = _storage(monkeypatch)
    assert await storage.paper_exists("W123") is False


@pytest.mark.asyncio
async def test_paper_exists_true_after_upload(monkeypatch):
    storage, _fake = _storage(monkeypatch)
    await storage.upload_paper("W123", b"%PDF-fake", {"id": "https://openalex.org/W123"})
    assert await storage.paper_exists("W123") is True


@pytest.mark.asyncio
async def test_upload_paper_writes_pdf_and_json_sidecar(monkeypatch):
    storage, fake = _storage(monkeypatch)
    await storage.upload_paper("W123", b"%PDF-fake", {"id": "https://openalex.org/W123", "title": "Test"})

    assert fake.objects["papers/W123.pdf"] == b"%PDF-fake"
    sidecar = json.loads(fake.objects["papers/W123.json"])
    assert sidecar["title"] == "Test"


@pytest.mark.asyncio
async def test_list_paper_metadata_returns_only_json_sidecars(monkeypatch):
    storage, fake = _storage(monkeypatch)
    await storage.upload_paper("W1", b"%PDF-1", {"id": "W1"})
    await storage.upload_paper("W2", b"%PDF-2", {"id": "W2"})

    metadata = await storage.list_paper_metadata()

    assert {m["id"] for m in metadata} == {"W1", "W2"}
    # PDF-ключи не должны попасть в результат (только *.json)
    assert all(not isinstance(m, bytes) for m in metadata)


@pytest.mark.asyncio
async def test_read_cursor_returns_none_when_absent(monkeypatch):
    storage, _fake = _storage(monkeypatch)
    assert await storage.read_cursor() is None


@pytest.mark.asyncio
async def test_write_then_read_cursor_roundtrips(monkeypatch):
    storage, _fake = _storage(monkeypatch)
    await storage.write_cursor(date(2026, 7, 20))
    assert await storage.read_cursor() == date(2026, 7, 20)


@pytest.mark.asyncio
async def test_upload_zotero_library_writes_csl_json_array(monkeypatch):
    storage, fake = _storage(monkeypatch)
    items = [{"id": "W1", "type": "article-journal"}]
    await storage.upload_zotero_library(items)

    assert json.loads(fake.objects["zotero/library.json"]) == items


@pytest.mark.asyncio
async def test_cursor_key_matches_expected_path(monkeypatch):
    storage, fake = _storage(monkeypatch)
    await storage.write_cursor(date(2026, 1, 1))
    assert CURSOR_KEY in fake.objects
