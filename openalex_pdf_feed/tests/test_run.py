# openalex_pdf_feed/tests/test_run.py
"""Юнит-тесты только на чистые вспомогательные функции run.py.

Сама run() — оркестрация, склеивающая уже покрытые тестами
OpenAlexClient/R2Storage/zotero_export; по прецеденту
db_seeder/seeder__scripts/seed_db.py (тоже без автотестов на верхнеуровневую
оркестрацию) намеренно не мокается целиком здесь — testable-логика уже
проверена в test_openalex_client.py/test_storage.py/test_zotero_export.py.
"""

import pytest

from openalex_pdf_feed.run import _get_config, _load_terms


class TestLoadTerms:
    def test_reads_flat_list_from_yaml(self, tmp_path, monkeypatch):
        terms_file = tmp_path / "terms.yaml"
        terms_file.write_text("- logotherapy\n- medical anthropology\n", encoding="utf-8")
        monkeypatch.setattr("openalex_pdf_feed.run.TERMS_FILE", terms_file)

        assert _load_terms() == ["logotherapy", "medical anthropology"]

    def test_empty_file_raises(self, tmp_path, monkeypatch):
        terms_file = tmp_path / "terms.yaml"
        terms_file.write_text("", encoding="utf-8")
        monkeypatch.setattr("openalex_pdf_feed.run.TERMS_FILE", terms_file)

        with pytest.raises(ValueError):
            _load_terms()


class TestGetConfig:
    _ALL_VARS = {
        "OPENALEX_API_KEY": "key",
        "R2_BUCKET": "bucket",
        "R2_ENDPOINT": "https://example.r2.cloudflarestorage.com",
        "R2_ACCESS_KEY_ID": "access",
        "R2_SECRET_ACCESS_KEY": "secret",
    }

    def test_reads_all_required_vars(self, monkeypatch):
        for key, value in self._ALL_VARS.items():
            monkeypatch.setenv(key, value)

        config = _get_config()

        assert config == {
            "openalex_api_key": "key",
            "r2_bucket": "bucket",
            "r2_endpoint": "https://example.r2.cloudflarestorage.com",
            "r2_access_key_id": "access",
            "r2_secret_access_key": "secret",
        }

    def test_missing_var_raises_keyerror(self, monkeypatch):
        for key, value in self._ALL_VARS.items():
            monkeypatch.setenv(key, value)
        monkeypatch.delenv("R2_BUCKET")

        with pytest.raises(KeyError):
            _get_config()
